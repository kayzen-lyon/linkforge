/**
 * Cache abstraction.
 *
 * Values are stored as raw `Buffer`s so the same backend serves JSON payloads
 * (metadata) and binary payloads (screenshots). Two implementations ship with
 * the boilerplate: an in-process LRU ({@link MemoryCache}) and Redis
 * ({@link RedisCache}). Swap them with the `REDIS_URL` environment variable.
 */
import { createHash } from 'node:crypto';

export interface Cache {
  /** Human-readable backend name, exposed by the health endpoint. */
  readonly kind: 'memory' | 'redis';
  /** Returns the cached value, or `null` on miss. Must never throw. */
  get(key: string): Promise<Buffer | null>;
  /** Stores a value for `ttlSeconds`. Must never throw. */
  set(key: string, value: Buffer, ttlSeconds: number): Promise<void>;
  /** Releases underlying resources (connections, timers). */
  close(): Promise<void>;
}

/**
 * Builds a deterministic, bounded-length cache key.
 *
 * @param namespace - Logical bucket, e.g. `meta` or `screenshot`.
 * @param parts - Everything that influences the result (URL, options...).
 */
export function cacheKey(namespace: string, parts: Readonly<Record<string, unknown>>): string {
  const canonical = JSON.stringify(Object.entries(parts).sort(([a], [b]) => a.localeCompare(b)));
  const digest = createHash('sha256').update(canonical).digest('hex');
  return `linkforge:v1:${namespace}:${digest}`;
}

/** Reads and parses a JSON value. A corrupted entry is treated as a miss. */
export async function getJson<T>(cache: Cache, key: string): Promise<T | null> {
  const raw = await cache.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw.toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Serialises and stores a JSON value. */
export async function setJson(
  cache: Cache,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await cache.set(key, Buffer.from(JSON.stringify(value), 'utf8'), ttlSeconds);
}

/**
 * Collapses concurrent identical computations into one ("single flight").
 *
 * Without it, a burst of N requests for the same uncached URL would launch N
 * fetches / N browser pages (cache stampede).
 */
export class SingleFlight {
  private readonly inflight = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing !== undefined) return existing as Promise<T>;

    const promise = task().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }
}
