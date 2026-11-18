import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../src/config.js';
import { resolveDotPath, toHttpUrl } from '../src/lib/dot-path.js';
import { AppError } from '../src/lib/errors.js';
import { ApiKeyRegistry } from '../src/security/api-keys.js';
import { parseHideSelectors } from '../src/services/screenshot-service.js';

describe('ApiKeyRegistry', () => {
  const registry = new ApiKeyRegistry(['first-key-0123456789', 'second-key-0123456789']);

  it('identifies known keys without exposing them', () => {
    const id = registry.identify('first-key-0123456789');
    expect(id).toMatch(/^key:[0-9a-f]{32}$/);
    expect(id).not.toContain('first-key');
    expect(registry.identify('second-key-0123456789')).not.toBe(id);
    expect(registry.identify('first-key-0123456789')).toBe(id);
  });

  it('rejects unknown, truncated and extended keys', () => {
    for (const key of ['', 'nope', 'first-key-012345678', 'first-key-01234567890', 'FIRST-KEY-0123456789']) {
      expect(registry.identify(key)).toBeNull();
    }
  });

  it('is disabled without keys', () => {
    const empty = new ApiKeyRegistry([]);
    expect(empty.enabled).toBe(false);
    expect(empty.identify('anything')).toBeNull();
    expect(registry.enabled).toBe(true);
  });
});

describe('API key configuration', () => {
  it('is off by default and parses a comma-separated list', () => {
    expect(loadConfig({}).apiKeys).toEqual([]);
    expect(loadConfig({ API_KEYS: ' ' }).apiKeys).toEqual([]);
    expect(
      loadConfig({ API_KEYS: ' aaaaaaaaaaaaaaaa , bbbbbbbbbbbbbbbb,,aaaaaaaaaaaaaaaa ' }).apiKeys,
    ).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
    expect(loadConfig({}).rateLimit.keyMax).toBe(600);
  });

  it('refuses weak keys without echoing them', () => {
    try {
      loadConfig({ API_KEYS: 'short-secret' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).not.toContain('short-secret');
    }
  });

  it('lowers the default PDF limit on serverless platforms', () => {
    expect(loadConfig({}).pdf.maxBytes).toBe(10 * 1024 * 1024);
    expect(loadConfig({ VERCEL: '1' }).pdf.maxBytes).toBe(4 * 1024 * 1024);
  });
});

describe('resolveDotPath', () => {
  const data = { title: 'T', image: { url: 'https://a/b.png', width: 0 }, images: [{ url: 'u0' }], n: null };

  it('walks objects and arrays', () => {
    expect(resolveDotPath(data, 'title')).toBe('T');
    expect(resolveDotPath(data, 'image.url')).toBe('https://a/b.png');
    expect(resolveDotPath(data, 'image.width')).toBe(0);
    expect(resolveDotPath(data, 'images.0.url')).toBe('u0');
    expect(resolveDotPath(data, 'n')).toBeNull();
  });

  it('returns undefined for missing paths and never reaches prototypes', () => {
    for (const path of ['nope', 'title.length', 'image.url.x', 'images.5', 'images.length', '__proto__', 'constructor', 'image.constructor.name', 'title.toString']) {
      expect(resolveDotPath(data, path)).toBeUndefined();
    }
  });
});

describe('toHttpUrl', () => {
  it('accepts only absolute http(s) URLs', () => {
    expect(toHttpUrl('https://example.com/é.png')).toBe('https://example.com/%C3%A9.png');
    expect(toHttpUrl('HTTP://example.com')).toBe('http://example.com/');
    for (const value of ['/relative', 'javascript:alert(1)', 'ftp://x/y', 'Title: http://x', 'http://']) {
      expect(toHttpUrl(value)).toBeNull();
    }
  });
});

describe('parseHideSelectors', () => {
  it('splits on top-level commas only', () => {
    expect(parseHideSelectors('.ad, #cookie ,, :is(header, footer) > a, [data-x="a,b"], .md\\:flex')).toEqual([
      '.ad',
      '#cookie',
      ':is(header, footer) > a',
      '[data-x="a,b"]',
      '.md\\:flex',
    ]);
  });

  it.each([
    '.a { color: red }',
    '.a } body { display: none',
    'a; b',
    '@import url(x)',
    '.a /* comment */',
    '</style><script>',
    Array.from({ length: 21 }, (_, i) => `.s${i}`).join(','),
    `.${'a'.repeat(201)}`,
  ])('refuses %s', (raw) => {
    expect(() => parseHideSelectors(raw)).toThrowError(AppError);
  });
});
