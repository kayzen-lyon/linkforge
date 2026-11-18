import type { Cache } from './cache.js';

interface Entry {
  readonly value: Buffer;
  readonly expiresAt: number;
}

/**
 * In-process LRU cache with per-entry TTL.
 *
 * Zero-dependency default backend: perfect for local development, tests and
 * single-instance deployments. It is **not shared between processes** — use
 * {@link RedisCache} as soon as the API runs on more than one instance.
 *
 * LRU ordering relies on `Map` preserving insertion order: a hit re-inserts
 * the entry, so the first key of the map is always the least recently used.
 */
export class MemoryCache implements Cache {
  readonly kind = 'memory' as const;
  private readonly entries = new Map<string, Entry>();

  /**
   * @param maxEntries - Capacity; the least recently used entry is evicted beyond it.
   * @param now - Clock, injectable for deterministic tests.
   */
  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): Promise<Buffer | null> {
    const entry = this.entries.get(key);
    if (entry === undefined) return Promise.resolve(null);

    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return Promise.resolve(null);

    this.entries.set(key, entry);
    return Promise.resolve(entry.value);
  }

  set(key: string, value: Buffer, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return Promise.resolve();

    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.entries.clear();
    return Promise.resolve();
  }

  /** Number of entries currently held (expired entries included until touched). */
  get size(): number {
    return this.entries.size;
  }
}
