import { Redis } from 'ioredis';

import type { Cache } from './cache.js';

/** Minimal logger contract so this module does not depend on Fastify. */
export interface CacheLogger {
  warn(obj: object, msg: string): void;
}

/**
 * Redis-backed cache, shared by every API instance.
 *
 * The cache is an optimisation, never a dependency: any Redis failure is
 * logged and degraded to a miss (reads) or a no-op (writes), so an outage
 * slows the service down instead of taking it down.
 */
export class RedisCache implements Cache {
  readonly kind = 'redis' as const;
  private readonly client: Redis;

  constructor(
    url: string,
    private readonly logger: CacheLogger,
  ) {
    this.client = new Redis(url, {
      // Fail fast instead of queueing commands while Redis is unreachable.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn({ err: error }, 'redis connection error');
    });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await this.client.getBuffer(key);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'cache read failed, treating as miss');
      return null;
    }
  }

  async set(key: string, value: Buffer, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'cache write failed, ignoring');
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
