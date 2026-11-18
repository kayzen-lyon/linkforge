/**
 * Centralised, typed runtime configuration.
 *
 * Every tunable is read once from environment variables, validated, and exposed
 * as an immutable object that is injected into services (no `process.env`
 * access anywhere else in the codebase).
 */

/** Policy applied by the anti-SSRF layer to every outbound destination. */
export interface SsrfPolicy {
  /** When true, loopback/private/link-local targets are allowed. Tests and local dev only. */
  readonly allowPrivateNetworks: boolean;
  /** Destination ports that may be contacted, or `'any'`. */
  readonly allowedPorts: readonly number[] | 'any';
}

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly trustProxy: boolean;
  readonly corsOrigin: string[] | '*';
  readonly redisUrl: string | null;
  readonly cache: {
    readonly metaTtlSeconds: number;
    readonly screenshotTtlSeconds: number;
    readonly pdfTtlSeconds: number;
    readonly extractTtlSeconds: number;
    readonly contentTtlSeconds: number;
    readonly memoryMaxEntries: number;
  };
  readonly http: {
    readonly timeoutMs: number;
    readonly maxBodyBytes: number;
    readonly maxRedirects: number;
    readonly userAgent: string;
  };
  readonly browser: {
    /** Maximum number of pages rendered simultaneously. */
    readonly maxConcurrency: number;
    /** Maximum number of jobs waiting for a free slot before we shed load. */
    readonly maxQueue: number;
    readonly acquireTimeoutMs: number;
    /** A Chromium process is recycled after serving this many jobs. */
    readonly maxUsesPerBrowser: number;
    readonly navigationTimeoutMs: number;
    /**
     * When true, Chromium comes from `@sparticuz/chromium` (a build made for
     * serverless functions) instead of the locally installed Playwright browser.
     */
    readonly serverless: boolean;
    /**
     * Where to download the serverless Chromium pack from when the binary was
     * not bundled with the function. Must match the installed
     * `@sparticuz/chromium` version.
     */
    readonly serverlessPackUrl: string;
  };
  readonly pdf: {
    /** Largest PDF the API accepts to return; bigger documents fail with `ETOOLARGE`. */
    readonly maxBytes: number;
  };
  readonly ssrf: SsrfPolicy;
  /**
   * Accepted `x-api-key` values. Empty means the feature is off: the header is
   * ignored and everybody shares the anonymous rate limit.
   */
  readonly apiKeys: readonly string[];
  readonly rateLimit: {
    /** Requests per window for anonymous clients (keyed by IP). */
    readonly max: number;
    /** Requests per window for a valid API key (keyed by the key). */
    readonly keyMax: number;
    readonly windowMs: number;
  };
}

type Env = Readonly<Record<string, string | undefined>>;

/** Thrown at boot when an environment variable has an unusable value. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

function readString(env: Env, key: string, fallback: string): string {
  const value = env[key]?.trim();
  return value === undefined || value === '' ? fallback : value;
}

function readInt(env: Env, key: string, fallback: number, min = 0): number {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new ConfigError(`${key} must be an integer >= ${min}, received "${raw}"`);
  }
  return value;
}

function readBool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new ConfigError(`${key} must be "true" or "false", received "${raw}"`);
}

function readPorts(env: Env, key: string, fallback: readonly number[]): readonly number[] | 'any' {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  if (raw === '*') return 'any';
  return raw.split(',').map((part) => {
    const port = Number(part.trim());
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new ConfigError(`${key} contains an invalid port: "${part}"`);
    }
    return port;
  });
}

/** Shortest API key accepted at boot: anything shorter is guessable online. */
const MIN_API_KEY_LENGTH = 16;

function readApiKeys(env: Env, key: string): readonly string[] {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === '') return [];
  const keys = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  for (const apiKey of keys) {
    // The value is never echoed: boot logs must not leak a secret.
    if (apiKey.length < MIN_API_KEY_LENGTH || apiKey.length > 256 || /\s/.test(apiKey)) {
      throw new ConfigError(
        `${key} entries must be ${MIN_API_KEY_LENGTH}-256 characters without whitespace`,
      );
    }
  }
  return Object.freeze([...new Set(keys)]);
}

function readEnvName(env: Env): AppConfig['env'] {
  const raw = readString(env, 'NODE_ENV', 'development');
  if (raw === 'development' || raw === 'test' || raw === 'production') return raw;
  throw new ConfigError(`NODE_ENV must be development, test or production, received "${raw}"`);
}

/**
 * Builds the application configuration from environment variables.
 *
 * @param env - Source of variables (defaults to `process.env`; injectable for tests).
 * @throws {ConfigError} When a variable is malformed, or when an unsafe
 *   combination is requested (private networks allowed in production).
 */
export function loadConfig(env: Env = process.env): AppConfig {
  const envName = readEnvName(env);
  // Vercel and AWS Lambda are detected automatically.
  const serverless = readBool(
    env,
    'BROWSER_SERVERLESS',
    env['VERCEL'] === '1' || (env['AWS_LAMBDA_FUNCTION_NAME'] ?? '') !== '',
  );
  const allowPrivateNetworks = readBool(env, 'SSRF_ALLOW_PRIVATE_NETWORKS', false);

  if (envName === 'production' && allowPrivateNetworks) {
    throw new ConfigError('SSRF_ALLOW_PRIVATE_NETWORKS=true is refused when NODE_ENV=production');
  }

  const cors = readString(env, 'CORS_ORIGIN', '*');
  const redisUrl = readString(env, 'REDIS_URL', '');

  return Object.freeze({
    env: envName,
    host: readString(env, 'HOST', '0.0.0.0'),
    port: readInt(env, 'PORT', 3000, 0),
    logLevel: readString(env, 'LOG_LEVEL', envName === 'test' ? 'silent' : 'info'),
    // A serverless platform always sits behind the provider's proxy.
    trustProxy: readBool(env, 'TRUST_PROXY', serverless),
    corsOrigin: cors === '*' ? '*' : cors.split(',').map((origin) => origin.trim()),
    redisUrl: redisUrl === '' ? null : redisUrl,
    cache: {
      metaTtlSeconds: readInt(env, 'CACHE_META_TTL_SECONDS', 3600),
      screenshotTtlSeconds: readInt(env, 'CACHE_SCREENSHOT_TTL_SECONDS', 3600),
      pdfTtlSeconds: readInt(env, 'CACHE_PDF_TTL_SECONDS', 3600),
      extractTtlSeconds: readInt(env, 'CACHE_EXTRACT_TTL_SECONDS', 3600),
      contentTtlSeconds: readInt(env, 'CACHE_CONTENT_TTL_SECONDS', 3600),
      memoryMaxEntries: readInt(env, 'CACHE_MEMORY_MAX_ENTRIES', 500, 1),
    },
    http: {
      timeoutMs: readInt(env, 'HTTP_TIMEOUT_MS', 10_000, 1),
      maxBodyBytes: readInt(env, 'HTTP_MAX_BODY_BYTES', 5 * 1024 * 1024, 1024),
      maxRedirects: readInt(env, 'HTTP_MAX_REDIRECTS', 5),
      userAgent: readString(
        env,
        'HTTP_USER_AGENT',
        'Mozilla/5.0 (compatible; LinkForgeBot/0.1; +https://github.com/your-org/linkforge)',
      ),
    },
    browser: {
      // A function instance has little CPU and memory: keep few pages in parallel.
      maxConcurrency: readInt(env, 'BROWSER_MAX_CONCURRENCY', serverless ? 2 : 4, 1),
      maxQueue: readInt(env, 'BROWSER_MAX_QUEUE', serverless ? 10 : 50),
      acquireTimeoutMs: readInt(env, 'BROWSER_ACQUIRE_TIMEOUT_MS', 15_000, 1),
      // The serverless Chromium build runs in single-process mode and exits when
      // its last page closes, so there every job gets its own short-lived browser.
      maxUsesPerBrowser: readInt(env, 'BROWSER_MAX_USES', serverless ? 1 : 200, 1),
      navigationTimeoutMs: readInt(env, 'BROWSER_NAVIGATION_TIMEOUT_MS', 20_000, 1),
      serverless,
      serverlessPackUrl: readString(
        env,
        'BROWSER_SERVERLESS_PACK_URL',
        'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar',
      ),
    },
    pdf: {
      // Serverless platforms cap the response body (4.5 MB on Vercel): stay under it.
      maxBytes: readInt(env, 'PDF_MAX_BYTES', (serverless ? 4 : 10) * 1024 * 1024, 1024),
    },
    ssrf: {
      allowPrivateNetworks,
      allowedPorts: readPorts(env, 'SSRF_ALLOWED_PORTS', [80, 443]),
    },
    apiKeys: readApiKeys(env, 'API_KEYS'),
    rateLimit: {
      max: readInt(env, 'RATE_LIMIT_MAX', 60, 1),
      keyMax: readInt(env, 'RATE_LIMIT_KEY_MAX', 600, 1),
      windowMs: readInt(env, 'RATE_LIMIT_WINDOW_MS', 60_000, 1000),
    },
  });
}
