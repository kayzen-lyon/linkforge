// @vitest-environment happy-dom
/**
 * Browser side, in happy-dom: real React, the real custom element of the SDK,
 * `fetch` replaced by a counter.
 */
import { act, createElement, StrictMode, type ReactElement } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLinkMetaCache, LinkPreview, OmnillinkProvider, useLinkMeta, type LinkMetaState, type LinkPreviewElement } from '../src/index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE = 'https://links.example.com';

const metadata = (url: string) => ({
  url,
  canonicalUrl: url,
  title: `Title of ${new URL(url).hostname}`,
  description: 'Description',
  author: null,
  publisher: 'Example',
  lang: 'en',
  date: null,
  image: null,
  images: [],
  favicon: null,
  logo: null,
  video: null,
  audio: null,
  keywords: [],
  feeds: [],
  jsonLd: [],
  contentType: 'text/html',
});

interface Call {
  readonly url: string;
  readonly target: string;
  readonly signal: AbortSignal | undefined;
  respond(): void;
  fail(status: number, code: string): void;
}

let calls: Call[];
let container: HTMLElement;
let root: Root | undefined;
let errors: ReturnType<typeof vi.spyOn>;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const target = new URL(input).searchParams.get('url') ?? '';
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal ?? undefined;
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      calls.push({
        url: input,
        target,
        signal,
        respond: () => resolve(json(200, { status: 'success', data: metadata(target), meta: { cached: false, source: 'http', durationMs: 3 } })),
        fail: (status, code) => resolve(json(status, { status: 'fail', code, message: `failed with ${code}` })),
      });
    });
  });
  container = document.createElement('div');
  document.body.append(container);
  errors = vi.spyOn(console, 'error');
  clearLinkMetaCache();
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

async function waitFor(check: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await flush(5);
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe('<LinkPreview> in the browser', () => {
  it('upgrades to the custom element, loads the card and reports it', async () => {
    const onLoad = vi.fn();
    let handle: LinkPreviewElement | null = null;
    await mount(
      createElement(LinkPreview, {
        url: 'https://example.com/post',
        baseUrl: BASE,
        loading: 'eager',
        size: 'large',
        className: 'mine',
        onLoad,
        ref: (node: LinkPreviewElement | null) => {
          handle = node;
        },
      }),
    );
    const node = container.querySelector('link-preview') as LinkPreviewElement;
    expect(handle).toBe(node);
    expect(node.getAttribute('url')).toBe('https://example.com/post');
    expect(node.getAttribute('base-url')).toBe(BASE);
    expect(node.getAttribute('class')).toBe('mine');
    // Before the upgrade the fallback link is what the user sees.
    expect(node.querySelector('a')?.getAttribute('href')).toBe('https://example.com/post');

    await waitFor(() => customElements.get('link-preview') !== undefined && calls.length === 1, 'the element to request the metadata');
    expect(calls[0]?.url).toBe(`${BASE}/api/v1/meta?url=https%3A%2F%2Fexample.com%2Fpost`);
    expect(node.getAttribute('state')).toBe('loading');

    await act(async () => calls[0]?.respond());
    await waitFor(() => node.getAttribute('state') === 'ready', 'the card');
    expect(node.shadowRoot?.querySelector('.title')?.textContent).toBe('Title of example.com');
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad.mock.calls[0]?.[0]).toMatchObject({ data: { title: 'Title of example.com' }, meta: { source: 'http' } });
    expect(errors).not.toHaveBeenCalled();
  });

  it('reports a failure and keeps the fallback', async () => {
    const onError = vi.fn();
    await mount(createElement(LinkPreview, { url: 'https://example.com/gone', baseUrl: BASE, loading: 'eager', onError }, createElement('a', { href: 'https://example.com/gone' }, 'My link')));
    await waitFor(() => calls.length === 1, 'the request');
    await act(async () => calls[0]?.fail(502, 'EUNREACHABLE'));
    const node = container.querySelector('link-preview') as LinkPreviewElement;
    await waitFor(() => node.getAttribute('state') === 'error', 'the error state');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toMatchObject({ name: 'OmnillinkError', code: 'EUNREACHABLE', status: 502 });
    expect(node.shadowRoot?.querySelector('slot')).not.toBeNull();
    expect(node.querySelector('a')?.textContent).toBe('My link');
  });

  it('follows prop changes and calls the latest handler', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await mount(createElement(LinkPreview, { url: 'https://a.example/', baseUrl: BASE, loading: 'eager', onLoad: first }));
    await waitFor(() => calls.length === 1, 'the first request');
    await act(async () => root?.render(createElement(LinkPreview, { url: 'https://b.example/', baseUrl: BASE, loading: 'eager', theme: 'dark', onLoad: second })));
    await waitFor(() => calls.length === 2, 'the second request');
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(calls[1]?.target).toBe('https://b.example/');
    expect(container.querySelector('link-preview')?.getAttribute('theme')).toBe('dark');
    await act(async () => calls[1]?.respond());
    await waitFor(() => second.mock.calls.length === 1, 'the load event');
    expect(first).not.toHaveBeenCalled();
  });

  it('aborts the request when unmounted', async () => {
    await mount(createElement(LinkPreview, { url: 'https://example.com/', baseUrl: BASE, loading: 'eager' }));
    await waitFor(() => calls.length === 1, 'the request');
    await act(async () => root?.unmount());
    root = undefined;
    expect(calls[0]?.signal?.aborted).toBe(true);
  });

  it('hydrates server markup without a warning, even when the element upgraded first', async () => {
    const tree = createElement(OmnillinkProvider, { baseUrl: BASE }, createElement(LinkPreview, { url: 'https://example.com/ssr', loading: 'eager', theme: 'light' }));
    container.innerHTML = renderToString(tree);
    const node = container.querySelector('link-preview') as LinkPreviewElement;
    // The element is already registered by the tests above: it upgraded on insertion.
    await waitFor(() => node.hasAttribute('state'), 'the upgrade');
    await act(async () => {
      root = hydrateRoot(container, tree);
    });
    await flush();
    expect(container.querySelector('link-preview')).toBe(node);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('useLinkMeta() in the browser', () => {
  const seen: Record<string, LinkMetaState[]> = {};
  function Probe({ name, url, enabled }: { name: string; url: string | null; enabled?: boolean }): null {
    (seen[name] ??= []).push(useLinkMeta(url, enabled === undefined ? {} : { enabled }));
    return null;
  }
  const last = (name: string): LinkMetaState | undefined => seen[name]?.at(-1);
  const app = (...probes: ReactElement[]): ReactElement => createElement(OmnillinkProvider, { baseUrl: BASE }, ...probes);

  beforeEach(() => {
    for (const name of Object.keys(seen)) delete seen[name];
  });

  it('goes from loading to success', async () => {
    await mount(app(createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/1' })));
    expect(seen['a']?.[0]).toMatchObject({ status: 'loading', isLoading: true, data: undefined });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/api/v1/meta?url=https%3A%2F%2Fexample.com%2F1`);
    await act(async () => calls[0]?.respond());
    expect(last('a')).toMatchObject({ status: 'success', isLoading: false, data: { title: 'Title of example.com' }, meta: { source: 'http' } });
  });

  it('shares one request between components asking for the same link', async () => {
    await mount(
      app(
        createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/same' }),
        createElement(Probe, { key: 'b', name: 'b', url: 'https://example.com/same' }),
        createElement(Probe, { key: 'c', name: 'c', url: 'https://example.com/other' }),
      ),
    );
    expect(calls.map((call) => call.target)).toEqual(['https://example.com/same', 'https://example.com/other']);
    await act(async () => calls[0]?.respond());
    expect(last('a')?.status).toBe('success');
    expect(last('b')?.status).toBe('success');
    expect(last('a')?.data).toBe(last('b')?.data);
    expect(last('c')?.status).toBe('loading');
  });

  it('reuses a fresh answer without a new request', async () => {
    await mount(app(createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/cached' })));
    await act(async () => calls[0]?.respond());
    await act(async () => root?.unmount());
    await mount(app(createElement(Probe, { key: 'b', name: 'b', url: 'https://example.com/cached' })));
    expect(calls).toHaveLength(1);
    expect(last('b')?.status).toBe('success');

    clearLinkMetaCache();
    await act(async () => root?.unmount());
    await mount(app(createElement(Probe, { key: 'c', name: 'c', url: 'https://example.com/cached' })));
    expect(calls).toHaveLength(2);
  });

  it('aborts on unmount, but only once nobody waits for the answer', async () => {
    await mount(
      app(
        createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/shared' }),
        createElement(Probe, { key: 'b', name: 'b', url: 'https://example.com/shared' }),
      ),
    );
    await act(async () => root?.render(app(createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/shared' }))));
    await flush(5);
    expect(calls[0]?.signal?.aborted).toBe(false);
    await act(async () => root?.unmount());
    root = undefined;
    await flush(5);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it('aborts the previous request when the url changes, and never shows stale data', async () => {
    await mount(app(createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/first' })));
    await act(async () => calls[0]?.respond());
    expect(last('a')?.status).toBe('success');
    const before = seen['a']?.length ?? 0;
    await act(async () => root?.render(app(createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/second' }))));
    expect(seen['a']?.slice(before).every((state) => state.status === 'loading')).toBe(true);
    await act(async () => calls[1]?.respond());
    expect(last('a')).toMatchObject({ status: 'success', data: { url: 'https://example.com/second' } });
  });

  it('reports an OmnillinkError and retries on the next mount', async () => {
    await mount(app(createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/broken' })));
    await act(async () => calls[0]?.fail(403, 'EFORBIDDENURL'));
    expect(last('a')).toMatchObject({ status: 'error', isLoading: false, error: { name: 'OmnillinkError', code: 'EFORBIDDENURL', status: 403 } });
    await act(async () => root?.unmount());
    await mount(app(createElement(Probe, { key: 'b', name: 'b', url: 'https://example.com/broken' })));
    expect(calls).toHaveLength(2);
  });

  it('stays idle without a url or when disabled', async () => {
    await mount(app(createElement(Probe, { key: 'a', name: 'a', url: null }), createElement(Probe, { key: 'b', name: 'b', url: 'https://example.com/', enabled: false })));
    expect(last('a')).toMatchObject({ status: 'idle', isLoading: false });
    expect(last('b')?.status).toBe('idle');
    expect(calls).toHaveLength(0);
  });

  it('makes a single request under StrictMode', async () => {
    await mount(createElement(StrictMode, null, app(createElement(Probe, { key: 'a', name: 'a', url: 'https://example.com/strict' }))));
    await flush(5);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal?.aborted).toBe(false);
    await act(async () => calls[0]?.respond());
    expect(last('a')?.status).toBe('success');
  });
});
