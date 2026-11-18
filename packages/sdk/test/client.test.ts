import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createClient, isLinkForgeError, LinkForgeError } from '../src/index.js';
import type { LinkMetadata, ReadableContent } from '../src/index.js';

const BASE = 'https://lf.example';
const TARGET = 'https://example.com/a b?x=1&y=é#frag';

type FetchArgs = [input: string, init: RequestInit];

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const success = (data: unknown): Response =>
  jsonResponse({ status: 'success', data, meta: { cached: true, source: 'http', durationMs: 12 } });

/** A client whose fetch is a mock answering with `respond()`. */
function setup(respond: () => Response | Promise<Response> = () => success({}), apiKey?: string) {
  const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(async () => respond());
  const client = createClient({
    baseUrl: BASE,
    fetch: fetchMock as unknown as typeof fetch,
    ...(apiKey === undefined ? {} : { apiKey }),
  });
  const lastUrl = (): URL => new URL(fetchMock.mock.calls.at(-1)![0]);
  const lastInit = (): RequestInit => fetchMock.mock.calls.at(-1)![1];
  return { client, fetchMock, lastUrl, lastInit };
}

/** Awaits a promise that must reject with a LinkForgeError and returns it. */
async function rejection(promise: Promise<unknown>): Promise<LinkForgeError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LinkForgeError);
    expect(isLinkForgeError(error)).toBe(true);
    return error as LinkForgeError;
  }
  throw new Error('expected the promise to reject');
}

describe('base URL', () => {
  it.each([
    ['https://lf.example', 'https://lf.example/api/v1/meta'],
    ['https://lf.example/', 'https://lf.example/api/v1/meta'],
    ['https://lf.example///', 'https://lf.example/api/v1/meta'],
    ['https://lf.example/api/v1', 'https://lf.example/api/v1/meta'],
    ['https://lf.example/api/v1/', 'https://lf.example/api/v1/meta'],
    ['https://lf.example/prefix', 'https://lf.example/prefix/api/v1/meta'],
    ['', '/api/v1/meta'],
  ])('normalises %j', (baseUrl, expected) => {
    const url = createClient({ baseUrl }).metaEmbedUrl('https://a.test/', 'image.url');
    expect(url.split('?')[0]).toBe(expected);
  });

  it('rejects a missing baseUrl', () => {
    expect(() => createClient({} as never)).toThrow(TypeError);
    expect(() => createClient(undefined as never)).toThrow(TypeError);
  });
});

describe('meta()', () => {
  it('builds the URL, encodes the target and returns data + meta', async () => {
    const data = { url: 'https://example.com/', title: 'Example' };
    const { client, fetchMock, lastUrl, lastInit } = setup(() => success(data));

    const result = await client.meta(TARGET);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const raw = fetchMock.mock.calls[0]![0];
    expect(raw.startsWith(`${BASE}/api/v1/meta?url=`)).toBe(true);
    // The target is one opaque parameter: none of its own delimiters leak.
    expect(raw).toBe(`${BASE}/api/v1/meta?url=${encodeURIComponent(TARGET).replace(/%20/g, '+')}`);
    expect(lastUrl().searchParams.get('url')).toBe(TARGET);
    expect([...lastUrl().searchParams.keys()]).toEqual(['url']);
    expect(lastInit().method).toBe('GET');
    expect(result).toEqual({ data, meta: { cached: true, source: 'http', durationMs: 12 } });
    expectTypeOf(result.data).toEqualTypeOf<LinkMetadata>();
  });

  it('serialises options, booleans included, and leaves out undefined and unknown keys', async () => {
    const { client, lastUrl } = setup();
    await client.meta('https://a.test/', {
      render: 'always',
      force: true,
      ttl: 3600,
      timeoutMs: 5000,
      signal: new AbortController().signal,
    });
    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({
      url: 'https://a.test/',
      render: 'always',
      force: 'true',
      ttl: '3600',
    });

    await client.meta('https://a.test/', { force: false, render: undefined, bogus: 1 } as never);
    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ url: 'https://a.test/', force: 'false' });
  });

  it('rejects an empty target without calling fetch', async () => {
    const { client, fetchMock } = setup();
    const error = await rejection(client.meta(''));
    expect(error).toMatchObject({ code: 'EINVALIDURL', status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('extract()', () => {
  it('sends fields as one JSON parameter and types the result after the rules', async () => {
    const fields = {
      price: { selector: '.price', attr: 'text', type: 'number' },
      links: { selector: 'a[href^="/p?x=1&y=2"]', attr: 'href', type: 'url', all: true },
      heading: { selector: 'h1' },
    } as const;
    const { client, lastUrl } = setup(() =>
      success({ url: 'https://shop.test/', fields: { price: 9.5, links: ['https://shop.test/p'], heading: null } }),
    );

    const { data } = await client.extract('https://shop.test/', fields, { render: 'never' });

    const params = lastUrl().searchParams;
    expect(lastUrl().pathname).toBe('/api/v1/extract');
    expect([...params.keys()]).toEqual(['url', 'fields', 'render']);
    expect(JSON.parse(params.get('fields')!)).toEqual(fields);
    expect(params.get('render')).toBe('never');
    expect(data.fields.price).toBe(9.5);

    expectTypeOf(data.fields.price).toEqualTypeOf<number | null>();
    expectTypeOf(data.fields.links).toEqualTypeOf<string[]>();
    expectTypeOf(data.fields.heading).toEqualTypeOf<string | null>();
  });

  it('infers literal rules written inline, without `as const`', async () => {
    const { client } = setup(() => success({ url: 'https://a.test/', fields: { n: [1, 2] } }));
    const { data } = await client.extract('https://a.test/', {
      n: { selector: 'li', type: 'number', all: true },
    });
    expectTypeOf(data.fields.n).toEqualTypeOf<number[]>();
    expect(data.fields.n).toEqual([1, 2]);
  });

  it('rejects fields that are not an object', async () => {
    const { client, fetchMock } = setup();
    const error = await rejection(client.extract('https://a.test/', 'h1' as never));
    expect(error.code).toBe('EINVALIDPARAMS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('content()', () => {
  it('builds the URL and returns the readable content', async () => {
    const { client, lastUrl } = setup(() => success({ url: 'https://a.test/', markdown: '# Hi', wordCount: 1 }));
    const { data, meta } = await client.content('https://a.test/post', { render: 'auto' });
    expect(lastUrl().pathname).toBe('/api/v1/content');
    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ url: 'https://a.test/post', render: 'auto' });
    expect(data.markdown).toBe('# Hi');
    expect(meta.cached).toBe(true);
    expectTypeOf(data).toEqualTypeOf<ReadableContent>();
  });
});

describe('screenshot() and pdf()', () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  it('screenshot() serialises every option and resolves to a typed Blob', async () => {
    const { client, lastUrl, lastInit } = setup(
      () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
    const blob = await client.screenshot('https://a.test/', {
      device: 'mobile',
      fullPage: true,
      format: 'jpeg',
      quality: 70,
      width: 390,
      height: 844,
      selector: 'main > article',
      waitFor: 500,
      colorScheme: 'dark',
      hide: ['.cookie-banner', '#ad, .promo'],
      force: false,
      ttl: 600,
    });

    expect(lastUrl().pathname).toBe('/api/v1/screenshot');
    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({
      url: 'https://a.test/',
      device: 'mobile',
      fullPage: 'true',
      format: 'jpeg',
      quality: '70',
      width: '390',
      height: '844',
      selector: 'main > article',
      waitFor: '500',
      colorScheme: 'dark',
      hide: '.cookie-banner,#ad, .promo',
      force: 'false',
      ttl: '600',
    });
    expect((lastInit().headers as Record<string, string>)['accept']).toBeUndefined();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it('screenshot() accepts hide as a plain string', async () => {
    const { client, lastUrl } = setup(() => new Response(bytes));
    await client.screenshot('https://a.test/', { hide: '.a,.b' });
    expect(lastUrl().searchParams.get('hide')).toBe('.a,.b');
  });

  it('pdf() serialises its options and resolves to a Blob', async () => {
    const { client, lastUrl } = setup(
      () => new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } }),
    );
    const blob = await client.pdf('https://a.test/', { format: 'Letter', landscape: true, printBackground: false });
    expect(lastUrl().pathname).toBe('/api/v1/pdf');
    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({
      url: 'https://a.test/',
      format: 'Letter',
      landscape: 'true',
      printBackground: 'false',
    });
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(4);
  });

  it('maps a JSON error on a binary endpoint', async () => {
    const { client } = setup(() =>
      jsonResponse({ status: 'fail', code: 'ESELECTORNOTFOUND', message: 'No element matches' }, { status: 404 }),
    );
    const error = await rejection(client.screenshot('https://a.test/', { selector: '#nope' }));
    expect(error).toMatchObject({ code: 'ESELECTORNOTFOUND', status: 404, message: 'No element matches' });
  });
});

describe('URL builders', () => {
  const client = createClient({ baseUrl: `${BASE}/`, apiKey: 'secret' });

  it('screenshotUrl() makes no request and never contains the API key', () => {
    const url = client.screenshotUrl(TARGET, { device: 'mobile', fullPage: true });
    expect(url).toBe(
      `${BASE}/api/v1/screenshot?url=${encodeURIComponent(TARGET).replace(/%20/g, '+')}&device=mobile&fullPage=true`,
    );
    expect(new URL(url).searchParams.get('url')).toBe(TARGET);
    expect(url).not.toContain('secret');
  });

  it('pdfUrl()', () => {
    expect(client.pdfUrl('https://a.test/', { format: 'A4', landscape: false })).toBe(
      `${BASE}/api/v1/pdf?url=https%3A%2F%2Fa.test%2F&format=A4&landscape=false`,
    );
    expect(client.pdfUrl('https://a.test/')).toBe(`${BASE}/api/v1/pdf?url=https%3A%2F%2Fa.test%2F`);
  });

  it('metaEmbedUrl()', () => {
    expect(client.metaEmbedUrl('https://a.test/', 'image.url', { ttl: 86400 })).toBe(
      `${BASE}/api/v1/meta?url=https%3A%2F%2Fa.test%2F&ttl=86400&embed=image.url`,
    );
    expect(() => client.metaEmbedUrl('https://a.test/', '')).toThrow(LinkForgeError);
  });

  it('throws synchronously on an empty target', () => {
    expect(() => client.screenshotUrl('  ')).toThrow(LinkForgeError);
  });
});

describe('API key', () => {
  it('is sent as x-api-key when configured', async () => {
    const { client, lastInit } = setup(() => success({}), 'k-123');
    await client.meta('https://a.test/');
    expect(lastInit().headers).toEqual({ accept: 'application/json', 'x-api-key': 'k-123' });
    expect(new URL(BASE).href).not.toContain('k-123');
  });

  it('is sent on binary endpoints too', async () => {
    const { client, lastInit } = setup(() => new Response(new Uint8Array(1)), 'k-123');
    await client.pdf('https://a.test/');
    expect(lastInit().headers).toEqual({ 'x-api-key': 'k-123' });
  });

  it('is absent otherwise', async () => {
    const { client, lastInit } = setup();
    await client.meta('https://a.test/');
    expect(lastInit().headers).toEqual({ accept: 'application/json' });
  });
});

describe('error mapping', () => {
  it('maps an API error body', async () => {
    const { client } = setup(() =>
      jsonResponse(
        { status: 'fail', code: 'EFORBIDDENURL', message: 'Destination refused' },
        { status: 403 },
      ),
    );
    const error = await rejection(client.meta('http://127.0.0.1/'));
    expect(error).toMatchObject({
      name: 'LinkForgeError',
      code: 'EFORBIDDENURL',
      status: 403,
      message: 'Destination refused',
      retryable: false,
    });
    expect(error).toBeInstanceOf(Error);
  });

  it('exposes Retry-After on a rate limit', async () => {
    const { client } = setup(() =>
      jsonResponse(
        { status: 'fail', code: 'ERATELIMIT', message: 'Too many requests' },
        { status: 429, headers: { 'retry-after': '17' } },
      ),
    );
    const error = await rejection(client.meta('https://a.test/'));
    expect(error).toMatchObject({ code: 'ERATELIMIT', status: 429, retryAfter: 17, retryable: true });
  });

  it('maps a non-JSON error to EHTTP with the HTTP status', async () => {
    const { client } = setup(
      () => new Response('<html><h1>502 Bad Gateway</h1></html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    const error = await rejection(client.meta('https://a.test/'));
    expect(error).toMatchObject({ code: 'EHTTP', status: 502 });
    expect(error.message).toBe('Request failed with HTTP 502 Bad Gateway');
  });

  it('maps a JSON error of an unknown shape to EHTTP', async () => {
    const { client } = setup(() => jsonResponse({ error: 'nope' }, { status: 500 }));
    expect(await rejection(client.content('https://a.test/'))).toMatchObject({ code: 'EHTTP', status: 500 });
  });

  it('maps a 200 that is not a LinkForge envelope to EBADRESPONSE', async () => {
    const { client } = setup(() => new Response('<!doctype html>', { status: 200 }));
    expect(await rejection(client.meta('https://a.test/'))).toMatchObject({ code: 'EBADRESPONSE', status: 200 });
  });

  it('treats an error envelope under a 200 as an error', async () => {
    const { client } = setup(() => jsonResponse({ status: 'error', code: 'EINTERNAL', message: 'boom' }));
    expect(await rejection(client.meta('https://a.test/'))).toMatchObject({ code: 'EINTERNAL', status: 200 });
  });

  it('maps a network failure to ENETWORK and keeps the cause', async () => {
    const cause = new TypeError('fetch failed');
    const { client } = setup(() => Promise.reject(cause));
    const error = await rejection(client.meta('https://a.test/'));
    expect(error).toMatchObject({ code: 'ENETWORK', status: 0, retryable: true });
    expect(error.message).toContain('fetch failed');
    expect(error.cause).toBe(cause);
  });

  /** A fetch that never answers but honours its abort signal, like the real one. */
  const hangingFetch = vi.fn(
    (_input: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  ) as unknown as typeof fetch;

  it('maps a timeout to ETIMEOUT and aborts the request', async () => {
    vi.useFakeTimers();
    try {
      const client = createClient({ baseUrl: BASE, fetch: hangingFetch, timeoutMs: 1000 });
      const pending = rejection(client.meta('https://a.test/'));
      await vi.advanceTimersByTimeAsync(999);
      await vi.advanceTimersByTimeAsync(1);
      const error = await pending;
      expect(error).toMatchObject({ code: 'ETIMEOUT', status: 0, retryable: true });
      expect(error.message).toContain('1000 ms');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a request override the timeout, and applies it while the body is read', async () => {
    vi.useFakeTimers();
    try {
      // Headers arrive at once, the body never does.
      const slowBody = (async (_input: string, init: RequestInit) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            init.signal!.addEventListener('abort', () =>
              controller.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        });
        return new Response(stream, { status: 200 });
      }) as unknown as typeof fetch;
      const client = createClient({ baseUrl: BASE, fetch: slowBody, timeoutMs: 60_000 });
      const pending = rejection(client.screenshot('https://a.test/', { timeoutMs: 50 }));
      await vi.advanceTimersByTimeAsync(50);
      expect(await pending).toMatchObject({ code: 'ETIMEOUT', status: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps a caller abort to EABORTED, before and during the request', async () => {
    const client = createClient({ baseUrl: BASE, fetch: hangingFetch });

    const controller = new AbortController();
    const pending = rejection(client.meta('https://a.test/', { signal: controller.signal }));
    controller.abort();
    expect(await pending).toMatchObject({ code: 'EABORTED', status: 0, retryable: false });

    const calls = vi.mocked(hangingFetch).mock.calls.length;
    const already = AbortSignal.abort();
    expect(await rejection(client.meta('https://a.test/', { signal: already }))).toMatchObject({ code: 'EABORTED' });
    expect(vi.mocked(hangingFetch).mock.calls.length).toBe(calls);
  });

  it('clears its timer after a successful request', async () => {
    vi.useFakeTimers();
    try {
      const { client } = setup();
      await client.meta('https://a.test/');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('extract() typing with loosely typed rules', () => {
  it('falls back to the union when the rules are not literal', () => {
    const rules: Record<string, import('../src/index.js').ExtractField> = { a: { selector: 'a' } };
    type Fields = import('../src/index.js').ExtractedFields<typeof rules>;
    expectTypeOf<Fields['a']>().toEqualTypeOf<string | number | (string | number)[] | null>();
  });
});
