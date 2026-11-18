/**
 * Configuration, read once from the environment. Nothing here is logged.
 */
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Public demo instance, used when `OMNILLINK_URL` is not set. */
export const DEFAULT_BASE_URL = 'https://omnillink.kayzen-lyon.com';

export interface Config {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  /** Time allowed for one request to the instance. */
  readonly timeoutMs: number;
  /** Largest text a tool returns before it truncates, in characters. */
  readonly maxChars: number;
  /** Largest screenshot returned inline, in bytes (before base64). */
  readonly maxImageBytes: number;
  /** Where `omnillink_pdf` writes its files. */
  readonly outputDir: string;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

type Env = Readonly<Record<string, string | undefined>>;

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function readConfig(env: Env): Config {
  const url = env['OMNILLINK_URL']?.trim();
  const key = env['OMNILLINK_API_KEY'];
  const apiKey = key === undefined || key === '' ? undefined : key;

  let baseUrl = DEFAULT_BASE_URL;
  if (url === undefined || url === '') {
    // A key belongs to one instance: never send it to the public default by accident.
    if (apiKey !== undefined) {
      throw new ConfigError('OMNILLINK_API_KEY is set but OMNILLINK_URL is not: say which instance the key is for');
    }
  } else {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ConfigError('OMNILLINK_URL is not a URL (expected e.g. https://links.example.com)');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigError('OMNILLINK_URL must start with http:// or https://');
    }
    if (parsed.username !== '' || parsed.password !== '') {
      throw new ConfigError('OMNILLINK_URL must not contain credentials; use OMNILLINK_API_KEY');
    }
    baseUrl = url;
  }

  const outputDir = env['OMNILLINK_MCP_OUTPUT_DIR']?.trim();
  return {
    baseUrl,
    apiKey,
    timeoutMs: integer(env, 'OMNILLINK_TIMEOUT_MS', 60_000, 1000, 600_000),
    maxChars: integer(env, 'OMNILLINK_MCP_MAX_CHARS', 20_000, 1000, 500_000),
    maxImageBytes: integer(env, 'OMNILLINK_MCP_MAX_IMAGE_BYTES', 700_000, 10_000, 20_000_000),
    outputDir: resolve(outputDir === undefined || outputDir === '' ? join(tmpdir(), 'omnillink-mcp') : outputDir),
  };
}
