import { describe, expect, it } from 'vitest';

import { cacheKey, MemoryCache, SingleFlight } from '../src/services/cache/index.js';

describe('MemoryCache', () => {
  it('expires entries after their TTL', async () => {
    let now = 0;
    const cache = new MemoryCache(10, () => now);
    await cache.set('k', Buffer.from('v'), 5);
    expect((await cache.get('k'))?.toString()).toBe('v');
    now = 5001;
    expect(await cache.get('k')).toBeNull();
  });

  it('evicts the least recently used entry', async () => {
    const cache = new MemoryCache(2);
    await cache.set('a', Buffer.from('1'), 60);
    await cache.set('b', Buffer.from('2'), 60);
    await cache.get('a'); // "a" becomes the most recently used
    await cache.set('c', Buffer.from('3'), 60);
    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('a')).not.toBeNull();
    expect(cache.size).toBe(2);
  });
});

describe('cacheKey', () => {
  it('is independent of property order', () => {
    expect(cacheKey('meta', { a: 1, b: 2 })).toBe(cacheKey('meta', { b: 2, a: 1 }));
    expect(cacheKey('meta', { a: 1 })).not.toBe(cacheKey('shot', { a: 1 }));
  });
});

describe('SingleFlight', () => {
  it('runs concurrent identical tasks once', async () => {
    const flights = new SingleFlight();
    let calls = 0;
    const task = async (): Promise<number> => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 42;
    };
    const results = await Promise.all([flights.run('k', task), flights.run('k', task)]);
    expect(results).toEqual([42, 42]);
    expect(calls).toBe(1);
  });
});
