/**
 * Service-level tests with stubbed I/O: what cannot be observed through HTTP
 * without waiting for real time to pass (cache lifetimes).
 */
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { MemoryCache } from '../src/services/cache/index.js';
import { ContentService } from '../src/services/content-service.js';
import { ExtractService } from '../src/services/extract-service.js';
import type { FetchedDocument, SafeFetcher } from '../src/services/fetcher.js';
import { MetaService } from '../src/services/meta-service.js';
import { PageLoader } from '../src/services/page-loader.js';
import type { Renderer } from '../src/services/renderer.js';

const HTML = `<html><head><title>Stub</title><meta name="description" content="d">
  <meta property="og:image" content="/i.png"></head>
  <body><article><p>${'word '.repeat(80)}</p><span class="price">12</span></article></body></html>`;

function setup(html: string | null = HTML) {
  let now = 1_000_000;
  let fetches = 0;
  const fetcher = {
    fetchDocument: async (target: URL): Promise<FetchedDocument> => {
      fetches += 1;
      return {
        finalUrl: target.href,
        status: 200,
        contentType: html === null ? 'image/png' : 'text/html',
        html,
      };
    },
  } as unknown as SafeFetcher;
  // Any browser use in these tests is a bug: fail loudly.
  const renderer = {
    render: () => Promise.reject(new Error('the browser must not be used')),
  } as unknown as Renderer;

  const config = loadConfig({ NODE_ENV: 'test', CACHE_META_TTL_SECONDS: '1000' });
  const cache = new MemoryCache(50, () => now);
  const loader = new PageLoader(config, fetcher, renderer);
  return {
    meta: new MetaService(config, cache, fetcher, renderer),
    extract: new ExtractService(config, cache, loader),
    content: new ContentService(config, cache, loader),
    advance: (seconds: number) => {
      now += seconds * 1000;
    },
    fetches: () => fetches,
  };
}

const URL_ = 'https://example.com/page';

describe('per-request cache lifetime (ttl)', () => {
  it('overrides the configured TTL of the cache entry', async () => {
    const s = setup();
    const request = { url: URL_, render: 'auto', force: false } as const;

    const first = await s.meta.getMetadata({ ...request, ttlSeconds: 60 });
    expect(first).toMatchObject({ cached: false, ttlSeconds: 60 });

    s.advance(59);
    expect((await s.meta.getMetadata({ ...request, ttlSeconds: 60 })).cached).toBe(true);

    // Past the requested 60 s, although the configured default is 1000 s.
    s.advance(2);
    expect((await s.meta.getMetadata({ ...request, ttlSeconds: 60 })).cached).toBe(false);
    expect(s.fetches()).toBe(2);
  });

  it('uses the configured TTL when none is requested', async () => {
    const s = setup();
    const request = { url: URL_, render: 'auto', force: false, ttlSeconds: null } as const;

    expect(await s.meta.getMetadata(request)).toMatchObject({ cached: false, ttlSeconds: 1000 });
    s.advance(999);
    expect((await s.meta.getMetadata(request)).cached).toBe(true);
    s.advance(2);
    expect((await s.meta.getMetadata(request)).cached).toBe(false);
  });
});

describe('ExtractService', () => {
  it('caches per rule set, whatever the JSON formatting', async () => {
    const s = setup();
    const base = { url: URL_, render: 'auto', force: false, ttlSeconds: null } as const;

    const first = await s.extract.extract({ ...base, fields: '{"p":{"selector":".price","type":"number"}}' });
    expect(first).toMatchObject({ cached: false, source: 'http', data: { fields: { p: 12 } } });

    const reformatted = await s.extract.extract({
      ...base,
      fields: '{ "p": { "type": "number", "selector": ".price" } }',
    });
    expect(reformatted.cached).toBe(true);

    const other = await s.extract.extract({ ...base, fields: '{"p":{"selector":".price"}}' });
    expect(other).toMatchObject({ cached: false, data: { fields: { p: '12' } } });
  });

  it('validates the rules before any network access', async () => {
    const s = setup();
    await expect(
      s.extract.extract({ url: URL_, render: 'auto', force: false, ttlSeconds: null, fields: 'nope' }),
    ).rejects.toMatchObject({ code: 'EINVALIDPARAMS' });
    expect(s.fetches()).toBe(0);
  });

  it('keeps the static result when a field is empty but the page has no script', async () => {
    const s = setup();
    const result = await s.extract.extract({
      url: URL_,
      render: 'auto',
      force: false,
      ttlSeconds: null,
      fields: '{"missing":{"selector":".nope"}}',
    });
    expect(result).toMatchObject({ source: 'http', data: { fields: { missing: null } } });
  });
});

describe('ContentService', () => {
  it('extracts and caches readable content', async () => {
    const s = setup();
    const request = { url: URL_, render: 'auto', force: false, ttlSeconds: 120 } as const;
    const first = await s.content.getContent(request);
    expect(first).toMatchObject({ cached: false, ttlSeconds: 120, data: { title: 'Stub', wordCount: 81 } });
    expect((await s.content.getContent(request)).cached).toBe(true);
    expect((await s.content.getContent({ ...request, force: true })).cached).toBe(false);
  });

  it('refuses non-HTML targets', async () => {
    const s = setup(null);
    await expect(
      s.content.getContent({ url: `${URL_}.png`, render: 'auto', force: false, ttlSeconds: null }),
    ).rejects.toMatchObject({ code: 'ENOTHTML', statusCode: 422 });
  });
});
