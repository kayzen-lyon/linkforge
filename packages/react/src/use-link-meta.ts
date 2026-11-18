'use client';

import type { LinkMetadata, OmnillinkClient, RenderMode, ResponseMeta } from '@omnillink/sdk';

import { clearOmnillinkCache } from './store.js';
import { useOmnillink } from './use-omnillink.js';

export interface UseLinkMetaOptions {
  /** Origin of the Omnillink instance. Defaults to the nearest `<OmnillinkProvider>`, then to the origin of the page. */
  readonly baseUrl?: string;
  /** Browser rendering strategy of the request. */
  readonly render?: RenderMode;
  /** `false` makes no request and reports `idle`. Default `true`. */
  readonly enabled?: boolean;
  /** Your own client (custom `fetch`, timeout…). Keep its identity stable between renders. */
  readonly client?: OmnillinkClient;
}

export type LinkMetaState =
  | { readonly status: 'idle'; readonly data: undefined; readonly meta: undefined; readonly error: undefined; readonly isLoading: false }
  | { readonly status: 'loading'; readonly data: undefined; readonly meta: undefined; readonly error: undefined; readonly isLoading: true }
  | { readonly status: 'success'; readonly data: LinkMetadata; readonly meta: ResponseMeta; readonly error: undefined; readonly isLoading: false }
  /** `error` is an `OmnillinkError` unless a custom client threw something else. */
  | { readonly status: 'error'; readonly data: undefined; readonly meta: undefined; readonly error: unknown; readonly isLoading: false };

/** Forgets every answer the hooks remembered with their built-in clients. Requests in flight are left alone. */
export function clearLinkMetaCache(): void {
  clearOmnillinkCache();
}

/**
 * Metadata of a link, fetched from the browser.
 *
 * - The first render is always `loading` (or `idle`), on the server and in the
 *   browser alike, so hydration never mismatches; no request is made on the server.
 * - Components asking for the same link share one request; an answer is reused
 *   for five minutes.
 * - Unmounting, or changing `url`, aborts the request when nobody else waits for it.
 */
export function useLinkMeta(url: string | null | undefined, options: UseLinkMetaOptions = {}): LinkMetaState {
  const { render, baseUrl, enabled, client } = options;
  return useOmnillink('meta', url, {
    ...(render === undefined ? {} : { params: { render } }),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(enabled === undefined ? {} : { enabled }),
    ...(client === undefined ? {} : { client }),
  });
}
