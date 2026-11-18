// @vitest-environment happy-dom
/**
 * The hooks over the newer endpoints, in happy-dom: real React, `fetch`
 * replaced by a recorder whose answers the test releases one by one.
 */
import { act, createElement, StrictMode, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createClient, type OmnillinkClient } from '@omnillink/sdk';

import {
  clearOmnillinkCache,
  OmnillinkProvider,
  useLinkCheck,
  useLinkMeta,
  useOmnillink,
  usePalette,
  useTech,
  type LinkCheck,
  type OmnillinkState,
  type PaletteData,
  type TechData,
} from '../src/index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = 'https://links.example.com';
const PAGE = 'https://example.com/';

const ANSWERS: Record<string, { data: unknown; meta: unknown }> = {
  tech: {
    data: { url: PAGE, technologies: [{ name: 'React', category: 'library', evidence: 'probe: react', confidence: 'high', version: '19.1.0' }], inspected: { bundles: 2, rendered: false } },
    meta: { cached: false, source: 'http', durationMs: 5 },
  },
  palette: {
    data: { url: 'https://example.com/cover.png', pageUrl: PAGE, format: 'png', dominant: '#14589f', colors: [{ hex: '#14589f', rgb: [20, 88, 159], population: 1 }] },
    meta: { cached: true, source: 'http', durationMs: 1 },
  },
  check: {
    data: { url: PAGE, finalUrl: PAGE, ok: false, status: 404, redirects: [{ url: PAGE, status: 404, durationMs: 3, location: null }], contentType: null, contentLength: null, tls: null, durationMs: 3 },
    meta: { durationMs: 4 },
  },
  links: { data: { url: PAGE, total: 0, internal: 0, external: 0, links: [], truncated: false }, meta: { cached: false, source: 'http', durationMs: 2 } },
  meta: { data: { url: PAGE, title: 'Example' }, meta: { cached: false, source: 'http', durationMs: 2 } },
};

interface Call {
  readonly url: URL;
  readonly endpoint: string;
  readonly signal: AbortSignal | undefined;
  respond(): void;
  fail(status: number, code: string): void;
}

let calls: Call[];
let container: HTMLElement;
let root: Root | undefined;
let errors: ReturnType<typeof vi.spyOn>;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': 'req-7', 'x-cache': 'MISS', 'x-ratelimit-remaining': '41' } });

const recorder = (input: string, init?: RequestInit): Promise<Response> => {
  const url = new URL(input);
  const endpoint = url.pathname.replace('/api/v1/', '');
  return new Promise<Response>((resolve, reject) => {
    const signal = init?.signal ?? undefined;
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    calls.push({
      url,
      endpoint,
      signal,
      respond: () => resolve(json(200, { status: 'success', ...ANSWERS[endpoint] })),
      fail: (status, code) => resolve(json(status, { status: 'fail', code, message: `failed with ${code}` })),
    });
  });
};

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', recorder);
  container = document.createElement('div');
  document.body.append(container);
  errors = vi.spyOn(console, 'error');
  clearOmnillinkCache();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  errors.mockRestore();
  vi.unstubAllGlobals();
});

const flush = (ms = 0): Promise<void> => act(() => new Promise<void>((done) => setTimeout(done, ms)));

async function mount(element: ReactElement): Promise<void> {
  root = createRoot(container);
  await act(async () => root?.render(element));
}

/** A component that records every state its hook returns. */
function probe<S>(useIt: () => S): { readonly Probe: () => null; readonly states: S[]; last(): S } {
  const states: S[] = [];
  return {
    Probe: () => {
      states.push(useIt());
      return null;
    },
    states,
    last: () => states.at(-1) as S,
  };
}

describe('useTech()', () => {
  it('goes loading → success, with typed data and what the response headers said', async () => {
    const { Probe, states, last } = probe(() => useTech(PAGE, { baseUrl: BASE, render: 'never' }));
    await mount(createElement(Probe));
    expect(states[0]).toMatchObject({ status: 'loading', isLoading: true, data: undefined });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.endpoint).toBe('tech');
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({ url: PAGE, render: 'never' });

    await act(async () => calls[0]?.respond());
    const state = last();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expectTypeOf(state.data).toEqualTypeOf<TechData>();
      expect(state.data.technologies[0]?.name).toBe('React');
      expect(state.meta.source).toBe('http');
      expect(state.response).toMatchObject({ requestId: 'req-7', cache: 'MISS', rateLimit: { remaining: 41 } });
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it('reports the OmnillinkError of a failed request and does not remember it', async () => {
    const { Probe, last } = probe(() => useTech(PAGE, { baseUrl: BASE }));
    await mount(createElement(Probe));
    await act(async () => calls[0]?.fail(502, 'EBLOCKED'));
    expect(last()).toMatchObject({ status: 'error', isLoading: false, error: { code: 'EBLOCKED', status: 502, retryable: false } });

    await act(async () => root?.unmount());
    await mount(createElement(Probe));
    expect(calls).toHaveLength(2);
  });
});

describe('useLinkCheck()', () => {
  it('reports a broken link as data, not as an error', async () => {
    const { Probe, last } = probe(() => useLinkCheck(PAGE, { baseUrl: BASE }));
    await mount(createElement(Probe));
    expect(calls[0]?.endpoint).toBe('check');
    expect([...(calls[0]?.url.searchParams.keys() ?? [])]).toEqual(['url']);
    await act(async () => calls[0]?.respond());
    const state = last();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expectTypeOf(state.data).toEqualTypeOf<LinkCheck>();
      expectTypeOf(state.meta).toEqualTypeOf<{ readonly durationMs: number }>();
      expect(state.data.ok).toBe(false);
      expect(state.data.status).toBe(404);
    }
  });

  it('shares a check between components mounted together, and checks again on a later mount', async () => {
    const a = probe(() => useLinkCheck(PAGE, { baseUrl: BASE }));
    const b = probe(() => useLinkCheck(PAGE, { baseUrl: BASE }));
    await mount(createElement('div', null, createElement(a.Probe), createElement(b.Probe)));
    expect(calls).toHaveLength(1);
    await act(async () => calls[0]?.respond());
    expect(a.last().status).toBe('success');
    expect(b.last().status).toBe('success');

    // Unlike the cacheable endpoints, the answer is not kept for the next mount.
    await act(async () => root?.unmount());
    await mount(createElement(a.Probe));
    expect(calls).toHaveLength(2);
  });
});

describe('usePalette()', () => {
  it('sends its parameters and types the palette', async () => {
    const { Probe, last } = probe(() => usePalette(PAGE, { baseUrl: BASE, count: 3 }));
    await mount(createElement(Probe));
    expect(calls[0]?.endpoint).toBe('palette');
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({ url: PAGE, count: '3' });
    await act(async () => calls[0]?.respond());
    const state = last();
    if (state.status !== 'success') throw new Error('expected success');
    expectTypeOf(state.data).toEqualTypeOf<PaletteData>();
    expect(state.data.dominant).toBe('#14589f');
    expect(state.data.colors[0]?.rgb).toEqual([20, 88, 159]);
  });
});

describe('useOmnillink()', () => {
  it('types data after the endpoint and takes the instance from the provider', async () => {
    const { Probe, last } = probe(() => useOmnillink('links', PAGE, { params: { scope: 'external', limit: 10 } }));
    await mount(createElement(OmnillinkProvider, { baseUrl: BASE }, createElement(Probe)));
    expect(calls[0]?.url.origin).toBe(BASE);
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({ url: PAGE, limit: '10', scope: 'external' });
    await act(async () => calls[0]?.respond());
    const state = last();
    if (state.status !== 'success') throw new Error('expected success');
    expectTypeOf(state.data.links).toEqualTypeOf<readonly import('@omnillink/sdk').PageLink[]>();
    expectTypeOf(last()).toEqualTypeOf<OmnillinkState<import('@omnillink/sdk').LinksData>>();
  });

  it('de-duplicates by value of the parameters, whatever the order of the keys or the identity of the object', async () => {
    const a = probe(() => useOmnillink('links', PAGE, { baseUrl: BASE, params: { scope: 'all', limit: 5 } }));
    const b = probe(() => useOmnillink('links', PAGE, { baseUrl: BASE, params: { limit: 5, scope: 'all', render: undefined } }));
    const c = probe(() => useOmnillink('links', PAGE, { baseUrl: BASE, params: { scope: 'internal', limit: 5 } }));
    await mount(createElement(StrictMode, null, createElement(a.Probe), createElement(b.Probe), createElement(c.Probe)));
    await flush();
    // Two requests for three components: a and b ask for the same thing.
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.signal?.aborted === false)).toBe(true);
    // Re-rendering with a new, equal object starts nothing.
    await act(async () => root?.render(createElement(StrictMode, null, createElement(a.Probe), createElement(b.Probe), createElement(c.Probe))));
    await flush();
    expect(calls).toHaveLength(2);
  });

  it('shares its store with the dedicated hooks: one request for useTech() and useOmnillink("tech")', async () => {
    const a = probe(() => useTech(PAGE, { baseUrl: BASE }));
    const b = probe(() => useOmnillink('tech', PAGE, { baseUrl: BASE }));
    const c = probe(() => useLinkMeta(PAGE, { baseUrl: BASE }));
    await mount(createElement('div', null, createElement(a.Probe), createElement(b.Probe), createElement(c.Probe)));
    expect(calls.map((call) => call.endpoint).sort()).toEqual(['meta', 'tech']);
    await act(async () => calls.forEach((call) => call.respond()));
    expect(a.last().status).toBe('success');
    expect(b.last().data).toBe(a.last().data);
    expect(c.last()).toMatchObject({ status: 'success', data: { title: 'Example' } });
  });

  it('reuses a fresh answer without a request, until the cache is cleared', async () => {
    const { Probe, last } = probe(() => useOmnillink('tech', PAGE, { baseUrl: BASE }));
    await mount(createElement(Probe));
    await act(async () => calls[0]?.respond());
    await act(async () => root?.unmount());

    await mount(createElement(Probe));
    await flush();
    expect(calls).toHaveLength(1);
    expect(last().status).toBe('success');

    await act(async () => root?.unmount());
    clearOmnillinkCache();
    await mount(createElement(Probe));
    expect(calls).toHaveLength(2);
  });

  it('aborts the request when the last component waiting for it unmounts', async () => {
    const a = probe(() => useOmnillink('palette', PAGE, { baseUrl: BASE }));
    await mount(createElement(a.Probe));
    expect(calls[0]?.signal?.aborted).toBe(false);
    await act(async () => root?.unmount());
    await flush(5);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it('aborts and starts over when the url or the parameters change', async () => {
    let count = 3;
    const { Probe, last } = probe(() => usePalette(PAGE, { baseUrl: BASE, count }));
    await mount(createElement(Probe));
    count = 5;
    await act(async () => root?.render(createElement(Probe)));
    await flush(5);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(calls[1]?.url.searchParams.get('count')).toBe('5');
    // The answer to the request that was replaced is never shown.
    expect(last().status).toBe('loading');
    await act(async () => calls[1]?.respond());
    expect(last().status).toBe('success');
  });

  it('makes no request when disabled, without a url, or for an unknown endpoint', async () => {
    const a = probe(() => useOmnillink('tech', PAGE, { baseUrl: BASE, enabled: false }));
    const b = probe(() => useOmnillink('tech', '  ', { baseUrl: BASE }));
    const c = probe(() => useOmnillink('screenshot' as never, PAGE, { baseUrl: BASE }));
    await mount(createElement('div', null, createElement(a.Probe), createElement(b.Probe), createElement(c.Probe)));
    await flush();
    expect(calls).toHaveLength(0);
    for (const item of [a, b, c]) expect(item.last()).toMatchObject({ status: 'idle', isLoading: false });
  });

  it('uses a custom client, with a store of its own', async () => {
    const custom: OmnillinkClient = createClient({ baseUrl: 'https://private.example.com', apiKey: 'k-123', fetch: recorder as unknown as typeof fetch });
    const mine = probe(() => useOmnillink('tech', PAGE, { client: custom }));
    const builtIn = probe(() => useOmnillink('tech', PAGE, { baseUrl: 'https://private.example.com' }));
    await mount(createElement('div', null, createElement(mine.Probe), createElement(builtIn.Probe)));
    // Same instance, same request, but never shared: one of them carries a key.
    expect(calls).toHaveLength(2);
  });

  it('renders loading on the server and makes no request there', () => {
    const { Probe, states } = probe(() => useTech(PAGE, { baseUrl: BASE }));
    renderToString(createElement(Probe));
    expect(states).toEqual([expect.objectContaining({ status: 'loading', isLoading: true })]);
    expect(calls).toHaveLength(0);
  });
});
