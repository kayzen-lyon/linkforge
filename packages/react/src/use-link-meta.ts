'use client';

import { useEffect, useState } from 'react';

import {
  createClient,
  type LinkMetadata,
  type OmnillinkClient,
  type OmnillinkResult,
  type RenderMode,
  type ResponseMeta,
} from '@omnillink/sdk';

import { useOmnillinkConfig } from './context.js';

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

const IDLE: LinkMetaState = { status: 'idle', data: undefined, meta: undefined, error: undefined, isLoading: false };
const LOADING: LinkMetaState = { status: 'loading', data: undefined, meta: undefined, error: undefined, isLoading: true };

// ---- shared request store ---------------------------------------------------
// One entry per (instance, url, render): components asking for the same link
// share one request, and a fresh answer is reused without a request at all.

/** How long an answer is reused. The server has its own cache behind this one. */
const FRESH_MS = 5 * 60_000;
const MAX_ENTRIES = 200;

interface Entry {
  readonly promise: Promise<OmnillinkResult<LinkMetadata>>;
  readonly controller: AbortController;
  subscribers: number;
  result: OmnillinkResult<LinkMetadata> | undefined;
  expires: number;
}

const defaultStore = new Map<string, Entry>();
const customStores = new WeakMap<OmnillinkClient, Map<string, Entry>>();
const clients = new Map<string, OmnillinkClient>();

function clientFor(baseUrl: string): OmnillinkClient {
  let client = clients.get(baseUrl);
  if (client === undefined) {
    client = createClient({ baseUrl });
    clients.set(baseUrl, client);
  }
  return client;
}

function storeFor(custom: OmnillinkClient | undefined): Map<string, Entry> {
  if (custom === undefined) return defaultStore;
  let store = customStores.get(custom);
  if (store === undefined) {
    store = new Map();
    customStores.set(custom, store);
  }
  return store;
}

function acquire(store: Map<string, Entry>, key: string, load: (signal: AbortSignal) => Promise<OmnillinkResult<LinkMetadata>>): Entry {
  const existing = store.get(key);
  if (existing !== undefined && (existing.result === undefined || existing.expires > Date.now())) {
    existing.subscribers += 1;
    return existing;
  }

  const controller = new AbortController();
  const entry: Entry = {
    controller,
    subscribers: 1,
    result: undefined,
    expires: 0,
    promise: load(controller.signal).then(
      (result) => {
        entry.result = result;
        entry.expires = Date.now() + FRESH_MS;
        return result;
      },
      (error: unknown) => {
        // Failures are not remembered: the next mount tries again.
        if (store.get(key) === entry) store.delete(key);
        throw error;
      },
    ),
  };
  // Subscribers attach their own handlers; this one keeps an abandoned
  // request from surfacing as an unhandled rejection.
  entry.promise.catch(() => undefined);

  store.delete(key);
  store.set(key, entry);
  if (store.size > MAX_ENTRIES) {
    for (const [oldKey, old] of store) {
      if (store.size <= MAX_ENTRIES) break;
      if (old.subscribers === 0 && old.result !== undefined) store.delete(oldKey);
    }
  }
  return entry;
}

function release(store: Map<string, Entry>, key: string, entry: Entry): void {
  entry.subscribers -= 1;
  if (entry.subscribers > 0 || entry.result !== undefined) return;
  // Not right away: under StrictMode an effect is torn down and set up again
  // in the same tick, and the request should survive that.
  setTimeout(() => {
    if (entry.subscribers > 0 || entry.result !== undefined) return;
    if (store.get(key) === entry) store.delete(key);
    entry.controller.abort();
  }, 0);
}

/** Forgets every answer `useLinkMeta()` remembered with its built-in clients. Requests in flight are left alone. */
export function clearLinkMetaCache(): void {
  for (const [key, entry] of defaultStore) {
    if (entry.result !== undefined) defaultStore.delete(key);
  }
}

// ---- the hook ---------------------------------------------------------------

interface Snapshot {
  readonly key: string | null;
  readonly state: LinkMetaState;
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
  const config = useOmnillinkConfig();
  const { render, client, enabled = true } = options;
  const baseUrl = options.baseUrl ?? config.baseUrl;
  const target = typeof url === 'string' ? url.trim() : '';
  const key = enabled && target !== '' ? JSON.stringify([baseUrl, target, render ?? null]) : null;

  const [snapshot, setSnapshot] = useState<Snapshot>({ key: null, state: IDLE });

  useEffect(() => {
    if (key === null) return undefined;
    const store = storeFor(client);
    const entry = acquire(store, key, (signal) =>
      (client ?? clientFor(baseUrl)).meta(target, { ...(render === undefined ? {} : { render }), signal }),
    );
    let active = true;
    entry.promise.then(
      ({ data, meta }) => {
        if (active) setSnapshot({ key, state: { status: 'success', data, meta, error: undefined, isLoading: false } });
      },
      (error: unknown) => {
        if (active) setSnapshot({ key, state: { status: 'error', data: undefined, meta: undefined, error, isLoading: false } });
      },
    );
    return () => {
      active = false;
      release(store, key, entry);
    };
  }, [key, client, baseUrl, target, render]);

  if (key === null) return IDLE;
  // A snapshot of another link is never shown for this one.
  return snapshot.key === key ? snapshot.state : LOADING;
}
