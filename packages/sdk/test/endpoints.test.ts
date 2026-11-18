import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createClient, OmnillinkError, responseInfo } from '../src/index.js';
import type {
  CheckMeta,
  FaviconData,
  InsightsData,
  LinkCheck,
  LinkMetadata,
  LinksData,
  MetaBatchItem,
  MetaBatchMeta,
  NotModified,
  OembedData,
  OmnillinkResult,
  OmnillinkText,
  PaletteData,
  PresetData,
  SitemapData,
  TablesData,
  TechData,
  ImageData,
} from '../src/index.js';

const BASE = 'https://lf.example';
const PAGE = 'https://a.test/page';

type FetchArgs = [input: string, init: RequestInit];

const HEADERS = {
  'content-type': 'application/json',
  'x-cache': 'HIT',
  'x-render-source': 'browser',
  'x-request-id': 'req-42',
  etag: '"abc"',
  'x-ratelimit-limit': '60',
  'x-ratelimit-remaining': '57',
  'x-ratelimit-reset': '31',
};

const success = (data: unknown, meta: unknown = { cached: true, source: 'browser', durationMs: 3 }): Response =>
  new Response(JSON.stringify({ status: 'success', data, meta }), { status: 200, headers: HEADERS });

function setup(respond: () => Response = () => success({})) {
  const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(async () => respond());
  const client = createClient({ baseUrl: BASE, fetch: fetchMock as unknown as typeof fetch, apiKey: 'k-secret' });
  const lastUrl = (): URL => new URL(fetchMock.mock.calls.at(-1)![0]);
  const lastInit = (): RequestInit => fetchMock.mock.calls.at(-1)![1];
  const query = (): Record<string, string> => Object.fromEntries(lastUrl().searchParams);
  return { client, fetchMock, lastUrl, lastInit, query };
}

async function rejection(promise: Promise<unknown>): Promise<OmnillinkError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(OmnillinkError);
    return error as OmnillinkError;
  }
  throw new Error('expected the promise to reject');
}

describe('JSON endpoints', () => {
  it('links()', async () => {
    const { client, lastUrl, query } = setup();
    const result = await client.links(PAGE, { scope: 'external', limit: 50, render: 'never', acceptLanguage: 'fr-FR' });
    expect(lastUrl().pathname).toBe('/api/v1/links');
    expect(query()).toEqual({ url: PAGE, scope: 'external', limit: '50', render: 'never', acceptLanguage: 'fr-FR' });
    expectTypeOf(result).toEqualTypeOf<OmnillinkResult<LinksData>>();
  });

  it('tech(), insights(), image(), palette(), favicon(), oembed(), sitemap(), tables()', async () => {
    const { client, lastUrl, query } = setup();

    expectTypeOf(await client.tech(PAGE, { render: 'always', userAgent: 'UA/1' })).toEqualTypeOf<OmnillinkResult<TechData>>();
    expect(lastUrl().pathname).toBe('/api/v1/tech');
    expect(query()).toEqual({ url: PAGE, render: 'always', userAgent: 'UA/1' });

    expectTypeOf(await client.insights(PAGE, { device: 'mobile', force: true })).toEqualTypeOf<OmnillinkResult<InsightsData>>();
    expect(lastUrl().pathname).toBe('/api/v1/insights');
    expect(query()).toEqual({ url: PAGE, device: 'mobile', force: 'true' });

    expectTypeOf(await client.image(PAGE, { ttl: 600 })).toEqualTypeOf<OmnillinkResult<ImageData>>();
    expect(lastUrl().pathname).toBe('/api/v1/image');
    expect(query()).toEqual({ url: PAGE, ttl: '600' });

    expectTypeOf(await client.palette(PAGE, { count: 3 })).toEqualTypeOf<OmnillinkResult<PaletteData>>();
    expect(lastUrl().pathname).toBe('/api/v1/palette');
    expect(query()).toEqual({ url: PAGE, count: '3' });

    expectTypeOf(await client.favicon(PAGE)).toEqualTypeOf<OmnillinkResult<FaviconData>>();
    expect(lastUrl().pathname).toBe('/api/v1/favicon');
    // `redirect` belongs to faviconUrl(): the JSON method never sends it.
    await client.favicon(PAGE, { redirect: true } as never);
    expect(query()).toEqual({ url: PAGE });

    expectTypeOf(await client.oembed(PAGE, { maxWidth: 640, maxHeight: 360 })).toEqualTypeOf<OmnillinkResult<OembedData>>();
    expect(lastUrl().pathname).toBe('/api/v1/oembed');
    expect(query()).toEqual({ url: PAGE, maxWidth: '640', maxHeight: '360' });

    expectTypeOf(await client.sitemap(PAGE, { limit: 10 })).toEqualTypeOf<OmnillinkResult<SitemapData>>();
    expect(lastUrl().pathname).toBe('/api/v1/sitemap');
    expect(query()).toEqual({ url: PAGE, limit: '10' });

    expectTypeOf(await client.tables(PAGE, { selector: '#prices', referer: 'https://r.test/' })).toEqualTypeOf<OmnillinkResult<TablesData>>();
    expect(lastUrl().pathname).toBe('/api/v1/tables');
    expect(query()).toEqual({ url: PAGE, selector: '#prices', referer: 'https://r.test/' });
    // `format` and `table` belong to tablesCsv().
    await client.tables(PAGE, { format: 'csv', table: 2 } as never);
    expect(query()).toEqual({ url: PAGE });
  });

  it('check() has its own meta and no cache options', async () => {
    const { client, lastUrl, query } = setup(() => success({ ok: true, status: 200 }, { durationMs: 9 }));
    const result = await client.check(PAGE);
    expect(lastUrl().pathname).toBe('/api/v1/check');
    expect(query()).toEqual({ url: PAGE });
    expect(result.meta).toEqual({ durationMs: 9 });
    expectTypeOf(result).toEqualTypeOf<OmnillinkResult<LinkCheck, CheckMeta>>();
  });

  it('content() forwards the new options and joins selector lists', async () => {
    const { client, query } = setup();
    await client.content(PAGE, {
      mainContent: false,
      include: ['article', '.lead'],
      exclude: '.ad',
      citations: true,
      waitForSelector: '#ready',
      force: true,
      ttl: 120,
    });
    expect(query()).toEqual({
      url: PAGE,
      mainContent: 'false',
      include: 'article,.lead',
      exclude: '.ad',
      citations: 'true',
      waitForSelector: '#ready',
      force: 'true',
      ttl: '120',
    });
    // A `format` smuggled in by a JavaScript caller cannot turn the JSON method into a text one.
    await client.content(PAGE, { format: 'markdown' } as never);
    expect(query()).toEqual({ url: PAGE });
  });

  it('extract() forwards waitForSelector, cache and header options', async () => {
    const { client, query } = setup();
    await client.extract(PAGE, { h: { selector: 'h1' } }, { waitForSelector: '.price', ttl: 60, acceptLanguage: 'de' });
    expect(query()).toEqual({ url: PAGE, fields: '{"h":{"selector":"h1"}}', waitForSelector: '.price', ttl: '60', acceptLanguage: 'de' });
  });
});

describe('extractPreset()', () => {
  it('sends the preset and types fields and sources after it', async () => {
    const data = {
      url: PAGE,
      preset: 'product',
      schemaType: 'Product',
      fields: { name: 'Kettle', price: 64, currency: 'EUR' },
      sources: { name: 'json-ld', price: 'json-ld', currency: null },
    };
    const { client, lastUrl, query } = setup(() => success(data));
    const result = await client.extractPreset(PAGE, 'product', { render: 'never' });

    expect(lastUrl().pathname).toBe('/api/v1/extract');
    expect(query()).toEqual({ url: PAGE, preset: 'product', render: 'never' });
    expect(result.data.fields.price).toBe(64);

    expectTypeOf(result.data).toEqualTypeOf<PresetData<'product'>>();
    expectTypeOf(result.data.preset).toEqualTypeOf<'product'>();
    expectTypeOf(result.data.fields.price).toEqualTypeOf<number | null>();
    expectTypeOf(result.data.fields.availability).toEqualTypeOf<string | null>();
    expectTypeOf(result.data.sources.price).toEqualTypeOf<'json-ld' | 'microdata' | 'opengraph' | 'meta' | 'css' | null>();
    // @ts-expect-error `headline` is a field of the article preset, not of product
    void result.data.fields.headline;
  });

  it('follows each preset', async () => {
    const { client } = setup(() => success({ fields: {}, sources: {} }));
    const article = await client.extractPreset(PAGE, 'article');
    const recipe = await client.extractPreset(PAGE, 'recipe');
    const event = await client.extractPreset(PAGE, 'event');
    expectTypeOf(article.data.fields.keywords).toEqualTypeOf<readonly string[] | null>();
    expectTypeOf(article.data.fields.wordCount).toEqualTypeOf<number | null>();
    expectTypeOf(recipe.data.fields.ingredients).toEqualTypeOf<readonly string[] | null>();
    expectTypeOf(recipe.data.fields.totalMinutes).toEqualTypeOf<number | null>();
    expectTypeOf(event.data.fields.startDate).toEqualTypeOf<string | null>();
    expectTypeOf(event.data.sources.address).toEqualTypeOf<'json-ld' | 'microdata' | 'opengraph' | 'meta' | 'css' | null>();
  });

  it('rejects an empty preset without calling fetch', async () => {
    const { client, fetchMock } = setup();
    const error = await rejection(client.extractPreset(PAGE, '' as never));
    expect(error.code).toBe('EINVALIDPARAMS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('metaBatch()', () => {
  it('POSTs the URLs as JSON and returns the items in order', async () => {
    const items = [
      { url: 'https://a.test/', status: 'success', data: { title: 'A' }, cached: false },
      { url: 'https://b.test/', status: 'error', code: 'ETARGETSTATUS', message: 'The target responded with HTTP 404' },
    ];
    const { client, fetchMock, lastInit } = setup(() => success(items, { succeeded: 1, failed: 1, durationMs: 40 }));
    const result = await client.metaBatch(['https://a.test/', 'https://b.test/'], { force: true, ttl: 300 });

    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/api/v1/meta/batch`);
    expect(lastInit().method).toBe('POST');
    expect(lastInit().headers).toEqual({ accept: 'application/json', 'content-type': 'application/json', 'x-api-key': 'k-secret' });
    expect(JSON.parse(lastInit().body as string)).toEqual({ urls: ['https://a.test/', 'https://b.test/'], force: true, ttl: 300 });
    expect(result.meta).toEqual({ succeeded: 1, failed: 1, durationMs: 40 });
    expectTypeOf(result).toEqualTypeOf<OmnillinkResult<readonly MetaBatchItem[], MetaBatchMeta>>();

    const [first, second] = result.data;
    if (first?.status === 'success') expectTypeOf(first.data).toEqualTypeOf<LinkMetadata>();
    if (second !== undefined && second.status !== 'success') expectTypeOf(second.code).toEqualTypeOf<string>();
    expect(second).toMatchObject({ status: 'error', code: 'ETARGETSTATUS' });
  });

  it('sends only what was given', async () => {
    const { client, lastInit } = setup(() => success([]));
    await client.metaBatch(['https://a.test/']);
    expect(JSON.parse(lastInit().body as string)).toEqual({ urls: ['https://a.test/'] });
  });

  it('rejects an empty list without calling fetch', async () => {
    const { client, fetchMock } = setup();
    expect((await rejection(client.metaBatch([]))).code).toBe('EINVALIDURL');
    expect((await rejection(client.metaBatch(['https://a.test/', '']))).code).toBe('EINVALIDURL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('text endpoints', () => {
  const textResponse = (body: string, headers: Record<string, string> = {}): Response =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers } });

  it('html() returns the markup as a string and the final URL', async () => {
    const { client, lastUrl, query, lastInit } = setup(() =>
      textResponse('<html><script>alert(1)</script></html>', { 'x-final-url': 'https://a.test/final', 'x-render-source': 'browser' }),
    );
    const result = await client.html(PAGE, { render: 'never', waitForSelector: 'main' });
    expect(lastUrl().pathname).toBe('/api/v1/html');
    expect(query()).toEqual({ url: PAGE, render: 'never', waitForSelector: 'main' });
    expect((lastInit().headers as Record<string, string>)['accept']).toBeUndefined();
    expect(result.data).toBe('<html><script>alert(1)</script></html>');
    expect(result.response.finalUrl).toBe('https://a.test/final');
    expect(result.response.renderSource).toBe('browser');
    expectTypeOf(result).toEqualTypeOf<OmnillinkText>();
  });

  it('contentText() asks for Markdown by default, plain text on demand', async () => {
    const { client, query } = setup(() => textResponse('# Hi'));
    const markdown = await client.contentText(PAGE, { citations: true });
    expect(query()).toEqual({ url: PAGE, citations: 'true', format: 'markdown' });
    expect(markdown.data).toBe('# Hi');
    await client.contentText(PAGE, { format: 'text' });
    expect(query()).toEqual({ url: PAGE, format: 'text' });
    // Never `json`: the method promises text.
    await client.contentText(PAGE, { format: 'json' } as never);
    expect(query()).toEqual({ url: PAGE, format: 'markdown' });
  });

  it('tablesCsv() selects one table', async () => {
    const { client, lastUrl, query } = setup(() => textResponse('Plan,Price\r\nFree,€0\r\n'));
    const csv = await client.tablesCsv(PAGE, { table: 1, selector: 'table.specs' });
    expect(lastUrl().pathname).toBe('/api/v1/tables');
    expect(query()).toEqual({ url: PAGE, table: '1', selector: 'table.specs', format: 'csv' });
    expect(csv.data).toBe('Plan,Price\r\nFree,€0\r\n');
  });
});

describe('binary endpoints', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const blobResponse = (type: string, headers: Record<string, string> = {}): Response =>
    new Response(bytes, { status: 200, headers: { 'content-type': type, ...headers } });

  it('screenshot() forwards the page-preparation and decoration options', async () => {
    const { client, query } = setup(() => blobResponse('image/png'));
    await client.screenshot(PAGE, {
      hideBanners: false,
      blockAds: true,
      waitForSelector: '#app',
      click: 'button.tab',
      scrollTo: '#pricing',
      frame: 'browser',
      radius: 12,
      padding: 40,
      background: '#0d1117',
      acceptLanguage: 'fr',
      userAgent: 'UA/1',
      referer: 'https://r.test/',
    });
    expect(query()).toEqual({
      url: PAGE,
      hideBanners: 'false',
      blockAds: 'true',
      waitForSelector: '#app',
      click: 'button.tab',
      scrollTo: '#pricing',
      frame: 'browser',
      radius: '12',
      padding: '40',
      background: '#0d1117',
      acceptLanguage: 'fr',
      userAgent: 'UA/1',
      referer: 'https://r.test/',
    });
  });

  it('pdf() forwards margins, scale, ranges, header and footer', async () => {
    const { client, query } = setup(() => blobResponse('application/pdf'));
    await client.pdf(PAGE, { margin: 10, scale: 0.8, pageRanges: '1-3,5', headerText: '{title}', footerText: 'Page {page} / {pages}', hideBanners: true });
    expect(query()).toEqual({ url: PAGE, margin: '10', scale: '0.8', pageRanges: '1-3,5', headerText: '{title}', footerText: 'Page {page} / {pages}', hideBanners: 'true' });
  });

  it('animation() resolves to an APNG Blob whose frame count is in responseInfo()', async () => {
    const { client, lastUrl, query } = setup(() => blobResponse('image/apng', { 'x-animation-frames': '4', 'x-cache': 'MISS' }));
    const blob = await client.animation(PAGE, { width: 640, height: 400, frames: 6, delay: 500, blockAds: true });
    expect(lastUrl().pathname).toBe('/api/v1/animation');
    expect(query()).toEqual({ url: PAGE, width: '640', height: '400', frames: '6', delay: '500', blockAds: 'true' });
    expect(blob.type).toBe('image/apng');
    expect(responseInfo(blob)).toMatchObject({ animationFrames: 4, cache: 'MISS', status: 200 });
  });

  it('qr() resolves to an SVG or PNG Blob', async () => {
    const { client, lastUrl, query } = setup(() => blobResponse('image/svg+xml; charset=utf-8', { 'x-qr-version': '3', etag: '"q"' }));
    const blob = await client.qr(PAGE, { format: 'svg', size: 300, margin: 2, ecc: 'H', color: '112233', background: '00000000' });
    expect(lastUrl().pathname).toBe('/api/v1/qr');
    expect(query()).toEqual({ url: PAGE, format: 'svg', size: '300', margin: '2', ecc: 'H', color: '112233', background: '00000000' });
    expect(blob.type).toContain('image/svg+xml');
    expect(responseInfo(blob)).toMatchObject({ qrVersion: 3, etag: '"q"' });
  });

  it('og() takes text, not a URL', async () => {
    const { client, lastUrl, query, fetchMock } = setup(() => blobResponse('image/png'));
    const blob = await client.og({ title: 'Hello & <b>world</b>', site: 'Example', template: 'gradient', theme: 'dark', accent: 'ff0066', format: 'png', timeoutMs: 1000 });
    expect(lastUrl().pathname).toBe('/api/v1/og');
    expect(query()).toEqual({ title: 'Hello & <b>world</b>', site: 'Example', template: 'gradient', theme: 'dark', accent: 'ff0066', format: 'png' });
    expect(blob.type).toBe('image/png');

    fetchMock.mockClear();
    expect((await rejection(client.og({ title: '  ' }))).code).toBe('EINVALIDPARAMS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('URL builders', () => {
  const client = createClient({ baseUrl: BASE, apiKey: 'k-secret' });

  it('qrUrl(), animationUrl(), faviconUrl(), ogUrl()', () => {
    expect(client.qrUrl(PAGE, { size: 256, format: 'png' })).toBe(`${BASE}/api/v1/qr?url=https%3A%2F%2Fa.test%2Fpage&size=256&format=png`);
    expect(client.animationUrl(PAGE, { frames: 4 })).toBe(`${BASE}/api/v1/animation?url=https%3A%2F%2Fa.test%2Fpage&frames=4`);
    expect(client.faviconUrl(PAGE)).toBe(`${BASE}/api/v1/favicon?url=https%3A%2F%2Fa.test%2Fpage&redirect=true`);
    expect(client.faviconUrl(PAGE, { ttl: 86400 })).toBe(`${BASE}/api/v1/favicon?url=https%3A%2F%2Fa.test%2Fpage&ttl=86400&redirect=true`);
    expect(client.ogUrl({ title: 'Mon article', site: 'Mon site', template: 'split' })).toBe(
      `${BASE}/api/v1/og?title=Mon+article&site=Mon+site&template=split`,
    );
  });

  it('never contain the API key, a signal or a timeout', () => {
    const urls = [
      client.qrUrl(PAGE),
      client.animationUrl(PAGE),
      client.faviconUrl(PAGE),
      client.ogUrl({ title: 'x', signal: new AbortController().signal, timeoutMs: 5 } as never),
      client.screenshotUrl(PAGE, { frame: 'phone' }),
    ];
    for (const url of urls) {
      expect(url).not.toContain('k-secret');
      expect(url).not.toMatch(/signal|timeoutMs/);
    }
  });

  it('throw synchronously on a missing url or title', () => {
    expect(() => client.qrUrl('')).toThrow(OmnillinkError);
    expect(() => client.ogUrl({ title: '' })).toThrow(OmnillinkError);
    expect(() => client.ogUrl(undefined as never)).toThrow(OmnillinkError);
  });
});

describe('response metadata', () => {
  it('surfaces cache state, render source, request id, etag and quota next to data and meta', async () => {
    const { client } = setup();
    const result = await client.meta(PAGE);
    expect(result.response).toEqual({
      status: 200,
      cache: 'HIT',
      renderSource: 'browser',
      requestId: 'req-42',
      etag: '"abc"',
      rateLimit: { limit: 60, remaining: 57, reset: 31 },
      finalUrl: null,
      animationFrames: null,
      qrVersion: null,
    });
    expect(responseInfo(result)).toBe(result.response);
  });

  it('is all null when the headers are absent or unreadable', async () => {
    const { client } = setup(
      () => new Response(JSON.stringify({ status: 'success', data: {}, meta: {} }), { headers: { 'x-cache': 'maybe', 'x-ratelimit-remaining': 'soon' } }),
    );
    const { response } = await client.meta(PAGE);
    expect(response).toMatchObject({ cache: null, renderSource: null, requestId: null, etag: null, rateLimit: null });
  });

  it('tolerates a fetch implementation whose responses have no headers', async () => {
    const fake = { ok: true, status: 200, text: async () => JSON.stringify({ status: 'success', data: 1, meta: {} }) };
    const client = createClient({ baseUrl: BASE, fetch: (async () => fake) as unknown as typeof fetch });
    const result = await client.meta(PAGE);
    expect(result.data).toBe(1);
    expect(result.response.requestId).toBeNull();
  });

  it('responseInfo() is undefined for a Blob the client did not produce', () => {
    expect(responseInfo(new Blob(['x']))).toBeUndefined();
  });
});

describe('conditional requests', () => {
  const notModified = (): Response => new Response(null, { status: 304, headers: { etag: '"abc"', 'x-cache': 'HIT', 'x-request-id': 'req-304' } });

  it('sends If-None-Match and resolves to a typed "not modified" outcome', async () => {
    const { client, lastInit, query } = setup(notModified);
    const result = await client.meta(PAGE, { ifNoneMatch: '"abc"', render: 'never' });

    expect((lastInit().headers as Record<string, string>)['if-none-match']).toBe('"abc"');
    // Never a query parameter.
    expect(query()).toEqual({ url: PAGE, render: 'never' });
    expectTypeOf(result).toEqualTypeOf<OmnillinkResult<LinkMetadata> | NotModified>();
    expect(result.notModified).toBe(true);
    if (result.notModified) {
      expectTypeOf(result.data).toEqualTypeOf<undefined>();
      expect(result.response).toMatchObject({ status: 304, etag: '"abc"', cache: 'HIT', requestId: 'req-304' });
    } else {
      expectTypeOf(result.data).toEqualTypeOf<LinkMetadata>();
    }
  });

  it('resolves to data when the copy is stale', async () => {
    const { client } = setup(() => success({ title: 'New' }));
    const result = await client.meta(PAGE, { ifNoneMatch: '"old"' });
    expect(result.notModified).toBeUndefined();
    if (!result.notModified) expect(result.data.title).toBe('New');
  });

  it('works on text methods and keeps the plain type without ifNoneMatch', async () => {
    const { client } = setup(notModified);
    const result = await client.contentText(PAGE, { ifNoneMatch: '"abc"' });
    expectTypeOf(result).toEqualTypeOf<OmnillinkText | NotModified>();
    expect(result.notModified).toBe(true);

    const plain = setup(() => new Response('x'));
    expectTypeOf(await plain.client.contentText(PAGE)).toEqualTypeOf<OmnillinkText>();
    expectTypeOf(await plain.client.html(PAGE, { render: 'never' })).toEqualTypeOf<OmnillinkText>();
  });

  it('widens the type when ifNoneMatch may or may not be set', async () => {
    const { client } = setup();
    const etag = undefined as string | undefined;
    const result = await client.links(PAGE, { ifNoneMatch: etag });
    expectTypeOf(result).toEqualTypeOf<OmnillinkResult<LinksData> | NotModified>();
  });

  it('treats an unsolicited 304 as an HTTP error', async () => {
    const { client } = setup(notModified);
    const error = await rejection(client.meta(PAGE));
    expect(error).toMatchObject({ code: 'EHTTP', status: 304, requestId: 'req-304' });
  });
});

describe('error codes', () => {
  const fail = (status: number, code: string, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify({ status: status >= 500 ? 'error' : 'fail', code, message: `${code} happened` }), {
      status,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-err', ...headers },
    });

  it.each([
    ['ERATELIMIT', 429, true],
    ['EBUSY', 503, true],
    ['ECIRCUITOPEN', 503, true],
    ['ETIMEOUT', 504, true],
    ['EUNREACHABLE', 502, true],
    ['EBLOCKED', 502, false],
    ['ETARGETSTATUS', 502, false],
    ['EEMBEDNOTFOUND', 404, false],
    ['EFORBIDDENURL', 403, false],
    ['EINVALIDPARAMS', 400, false],
  ])('%s (HTTP %i) retryable=%s', async (code, status, retryable) => {
    const { client } = setup(() => fail(status, code));
    const error = await rejection(client.tech(PAGE));
    expect(error).toMatchObject({ code, status, retryable, requestId: 'req-err' });
  });

  it('keeps Retry-After next to a retryable code', async () => {
    const { client } = setup(() => fail(429, 'ERATELIMIT', { 'retry-after': '12' }));
    const error = await rejection(client.check(PAGE));
    expect(error).toMatchObject({ retryable: true, retryAfter: 12 });
  });

  it('narrows on the new codes', () => {
    const error = new OmnillinkError({ code: 'ECIRCUITOPEN', status: 503, message: 'x' });
    if (error.code === 'EBLOCKED' || error.code === 'ECIRCUITOPEN') expect(error.retryable).toBe(true);
    expect(error.requestId).toBeUndefined();
  });
});
