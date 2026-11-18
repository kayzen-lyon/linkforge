import type { AppConfig } from '../../config.js';
import type { Cache } from './cache.js';
import { MemoryCache } from './memory-cache.js';
import { RedisCache, type CacheLogger } from './redis-cache.js';

export * from './cache.js';
export { MemoryCache } from './memory-cache.js';
export { RedisCache } from './redis-cache.js';

/**
 * Selects the cache backend: Redis when `REDIS_URL` is set, in-memory LRU otherwise.
 */
export function createCache(config: AppConfig, logger: CacheLogger): Cache {
  if (config.redisUrl !== null) return new RedisCache(config.redisUrl, logger);
  return new MemoryCache(config.cache.memoryMaxEntries);
}
