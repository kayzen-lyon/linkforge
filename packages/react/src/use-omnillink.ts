'use client';

import { useEffect, useState } from 'react';

import type {
  CheckMeta,
  ContentOptions,
  FaviconData,
  FaviconOptions,
  ImageData,
  ImageOptions,
  InsightsData,
  InsightsOptions,
  LinkCheck,
  LinkMetadata,
  LinksData,
  LinksOptions,
  MetaOptions,
  OembedData,
  OembedOptions,
  OmnillinkClient,
  PaletteData,
  PaletteOptions,
  ReadableContent,
  ResponseInfo,
  ResponseMeta,
  SitemapData,
  SitemapOptions,
  TablesData,
  TablesOptions,
  TechData,
  TechOptions,
} from '@omnillink/sdk';

import { useOmnillinkConfig } from './context.js';
import { acquire, clientFor, FRESH_MS, release, storeFor } from './store.js';

/** The read endpoints a component can ask for: what each answers with, and what it takes. */
export interface OmnillinkEndpoints {
  readonly meta: { readonly data: LinkMetadata; readonly meta: ResponseMeta; readonly params: MetaOptions };
  readonly content: { readonly data: ReadableContent; readonly meta: ResponseMeta; readonly params: ContentOptions };
  readonly links: { readonly data: LinksData; readonly meta: ResponseMeta; readonly params: LinksOptions };
  readonly tables: { readonly data: TablesData; readonly meta: ResponseMeta; readonly params: TablesOptions };
  readonly tech: { readonly data: TechData; readonly meta: ResponseMeta; readonly params: TechOptions };
  readonly insights: { readonly data: InsightsData; readonly meta: ResponseMeta; readonly params: InsightsOptions };
  readonly image: { readonly data: ImageData; readonly meta: ResponseMeta; readonly params: ImageOptions };
  readonly palette: { readonly data: PaletteData; readonly meta: ResponseMeta; readonly params: PaletteOptions };
  readonly favicon: { readonly data: FaviconData; readonly meta: ResponseMeta; readonly params: FaviconOptions };
  readonly oembed: { readonly data: OembedData; readonly meta: ResponseMeta; readonly params: OembedOptions };
  readonly sitemap: { readonly data: SitemapData; readonly meta: ResponseMeta; readonly params: SitemapOptions };
  // `check` is never cached by the server and takes no parameter.
  readonly check: { readonly data: LinkCheck; readonly meta: CheckMeta; readonly params: Record<never, never> };
}

export type OmnillinkEndpoint = keyof OmnillinkEndpoints;

const ENDPOINTS: ReadonlySet<string> = new Set([
  'meta', 'content', 'links', 'tables', 'tech', 'insights', 'image', 'palette', 'favicon', 'oembed', 'sitemap', 'check',
] satisfies OmnillinkEndpoint[]);

export interface UseOmnillinkOptions<E extends OmnillinkEndpoint = OmnillinkEndpoint> {
  /** Parameters of the endpoint (`render`, `count`, `scope`…). Compared by value: an inline object is fine. */
  readonly params?: OmnillinkEndpoints[E]['params'];
  /** Origin of the Omnillink instance. Defaults to the nearest `<OmnillinkProvider>`, then to the origin of the page. */
  readonly baseUrl?: string;
  /** `false` makes no request and reports `idle`. Default `true`. */
  readonly enabled?: boolean;
  /** Your own client (custom `fetch`, timeout…). Keep its identity stable between renders. */
  readonly client?: OmnillinkClient;
  /**
   * How long an answer is reused by other mounts, in milliseconds. Default: five
   * minutes; `0` for `check`, whose point is the state of the link right now.
   */
  readonly freshMs?: number;
}

export type OmnillinkState<D, M = ResponseMeta> =
  | { readonly status: 'idle'; readonly data: undefined; readonly meta: undefined; readonly response: undefined; readonly error: undefined; readonly isLoading: false }
  | { readonly status: 'loading'; readonly data: undefined; readonly meta: undefined; readonly response: undefined; readonly error: undefined; readonly isLoading: true }
  /** `response` carries what the headers said: cache state, request id, quota left. */
  | { readonly status: 'success'; readonly data: D; readonly meta: M; readonly response: ResponseInfo | undefined; readonly error: undefined; readonly isLoading: false }
  /** `error` is an `OmnillinkError` unless a custom client threw something else. */
  | { readonly status: 'error'; readonly data: undefined; readonly meta: undefined; readonly response: undefined; readonly error: unknown; readonly isLoading: false };

type AnyState = OmnillinkState<unknown, unknown>;

const IDLE: AnyState = { status: 'idle', data: undefined, meta: undefined, response: undefined, error: undefined, isLoading: false };
const LOADING: AnyState = { status: 'loading', data: undefined, meta: undefined, response: undefined, error: undefined, isLoading: true };

/** `JSON.stringify` with sorted keys and without `undefined`: two equal parameter objects give one key. */
function stable(params: object | undefined): string {
  if (params === undefined || params === null) return '';
  const source = params as Record<string, unknown>;
  const kept = Object.keys(source)
    .filter((name) => source[name] !== undefined && name !== 'signal' && name !== 'timeoutMs' && name !== 'ifNoneMatch')
    .sort();
  // No parameter at all and an empty object are the same request.
  return kept.length === 0 ? '' : JSON.stringify(kept.map((name) => [name, source[name]]));
}

interface Snapshot {
  readonly key: string | null;
  readonly state: AnyState;
}

type Call = (url: string, options: object) => Promise<{ readonly data: unknown; readonly meta: unknown; readonly response?: ResponseInfo }>;

/**
 * One read endpoint of Omnillink for one URL, fetched from the browser.
 *
 * - The first render is always `loading` (or `idle`), on the server and in the
 *   browser alike, so hydration never mismatches; no request is made on the server.
 * - Components asking for the same thing share one request; an answer is reused
 *   for five minutes (see `freshMs`).
 * - Unmounting, or changing `url` or `params`, aborts the request when nobody
 *   else waits for it.
 *
 * @example
 * const { status, data } = useOmnillink('links', url, { params: { scope: 'external' } });
 */
export function useOmnillink<E extends OmnillinkEndpoint>(
  endpoint: E,
  url: string | null | undefined,
  options: UseOmnillinkOptions<E> = {},
): OmnillinkState<OmnillinkEndpoints[E]['data'], OmnillinkEndpoints[E]['meta']> {
  type State = OmnillinkState<OmnillinkEndpoints[E]['data'], OmnillinkEndpoints[E]['meta']>;
  const config = useOmnillinkConfig();
  const { client, enabled = true } = options;
  const baseUrl = options.baseUrl ?? config.baseUrl;
  const freshMs = options.freshMs ?? (endpoint === 'check' ? 0 : FRESH_MS);
  const target = typeof url === 'string' ? url.trim() : '';
  const serialized = stable(options.params);
  const known = ENDPOINTS.has(endpoint);
  const key = enabled && known && target !== '' ? JSON.stringify([baseUrl, endpoint, target, serialized]) : null;

  const [snapshot, setSnapshot] = useState<Snapshot>({ key: null, state: IDLE });

  useEffect(() => {
    if (key === null) return undefined;
    const store = storeFor(client);
    const entry = acquire(store, key, freshMs, (signal) => {
      const call = (client ?? clientFor(baseUrl))[endpoint] as unknown as Call;
      const params = serialized === '' ? {} : (Object.fromEntries(JSON.parse(serialized) as [string, unknown][]) as object);
      return call(target, { ...params, signal });
    });
    let active = true;
    (entry.promise as ReturnType<Call>).then(
      ({ data, meta, response }) => {
        if (active) setSnapshot({ key, state: { status: 'success', data, meta, response, error: undefined, isLoading: false } });
      },
      (error: unknown) => {
        if (active) setSnapshot({ key, state: { status: 'error', data: undefined, meta: undefined, response: undefined, error, isLoading: false } });
      },
    );
    return () => {
      active = false;
      release(store, key, entry);
    };
    // `serialized` stands for `options.params`: the effect only re-runs when their value changes.
  }, [key, client, baseUrl, endpoint, target, serialized, freshMs]);

  if (key === null) return IDLE as State;
  // A snapshot of another request is never shown for this one.
  return (snapshot.key === key ? snapshot.state : LOADING) as State;
}

type Shortcut<E extends OmnillinkEndpoint> = Omit<UseOmnillinkOptions<E>, 'params'> & OmnillinkEndpoints[E]['params'];

/** Splits `{ render, baseUrl, enabled… }` into the hook's own options and the endpoint's parameters. */
function split<E extends OmnillinkEndpoint>(options: Shortcut<E>): UseOmnillinkOptions<E> {
  const { baseUrl, enabled, client, freshMs, ...params } = options as UseOmnillinkOptions<E> & Record<string, unknown>;
  return {
    params: params as OmnillinkEndpoints[E]['params'],
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(enabled === undefined ? {} : { enabled }),
    ...(client === undefined ? {} : { client }),
    ...(freshMs === undefined ? {} : { freshMs }),
  };
}

export type UseTechOptions = Shortcut<'tech'>;
export type TechState = OmnillinkState<TechData>;

/** Technologies of a page: `useOmnillink('tech', …)` with its parameters at the top level. */
export function useTech(url: string | null | undefined, options: UseTechOptions = {}): TechState {
  return useOmnillink('tech', url, split<'tech'>(options));
}

export type UsePaletteOptions = Shortcut<'palette'>;
export type PaletteState = OmnillinkState<PaletteData>;

/** Dominant colours of an image, or of a page's preview image. */
export function usePalette(url: string | null | undefined, options: UsePaletteOptions = {}): PaletteState {
  return useOmnillink('palette', url, split<'palette'>(options));
}

export type UseLinkCheckOptions = Omit<UseOmnillinkOptions<'check'>, 'params'>;
export type LinkCheckState = OmnillinkState<LinkCheck, CheckMeta>;

/**
 * State of a link right now: status, redirect chain, certificate. A broken link
 * is `status: 'success'` with `data.ok === false`; `error` is for the check itself failing.
 * Components mounted together share the request; a later mount checks again.
 */
export function useLinkCheck(url: string | null | undefined, options: UseLinkCheckOptions = {}): LinkCheckState {
  return useOmnillink('check', url, options);
}
