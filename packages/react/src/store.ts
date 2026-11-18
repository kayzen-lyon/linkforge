/**
 * The request store shared by every hook: one entry per (instance, endpoint,
 * url, parameters). Components asking for the same thing share one request, a
 * fresh answer is reused without a request at all, and a request nobody waits
 * for any more is aborted.
 */
import { createClient, type OmnillinkClient } from '@omnillink/sdk';

/** How long an answer is reused by default. The server has its own cache behind this one. */
export const FRESH_MS = 5 * 60_000;
const MAX_ENTRIES = 200;

export interface Entry {
  readonly promise: Promise<unknown>;
  readonly controller: AbortController;
  subscribers: number;
  /** Set once the request has succeeded. */
  settled: boolean;
  expires: number;
}

export type Store = Map<string, Entry>;

const defaultStore: Store = new Map();
const customStores = new WeakMap<OmnillinkClient, Store>();
const clients = new Map<string, OmnillinkClient>();

/** The built-in client of an instance: one per `baseUrl`, created on first use. */
export function clientFor(baseUrl: string): OmnillinkClient {
  let client = clients.get(baseUrl);
  if (client === undefined) {
    client = createClient({ baseUrl });
    clients.set(baseUrl, client);
  }
  return client;
}

/** Answers obtained through a caller's own client are kept apart: it may carry a key. */
export function storeFor(custom: OmnillinkClient | undefined): Store {
  if (custom === undefined) return defaultStore;
  let store = customStores.get(custom);
  if (store === undefined) {
    store = new Map();
    customStores.set(custom, store);
  }
  return store;
}

/** Joins the request of `key`, starting it when there is none in flight and no fresh answer. */
export function acquire(store: Store, key: string, freshMs: number, load: (signal: AbortSignal) => Promise<unknown>): Entry {
  const existing = store.get(key);
  if (existing !== undefined && (!existing.settled || existing.expires > Date.now())) {
    existing.subscribers += 1;
    return existing;
  }

  const controller = new AbortController();
  const entry: Entry = {
    controller,
    subscribers: 1,
    settled: false,
    expires: 0,
    promise: load(controller.signal).then(
      (result) => {
        entry.settled = true;
        entry.expires = Date.now() + freshMs;
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
      if (old.subscribers === 0 && old.settled) store.delete(oldKey);
    }
  }
  return entry;
}

/** Leaves the request of `key`; the last one out aborts it if it is still in flight. */
export function release(store: Store, key: string, entry: Entry): void {
  entry.subscribers -= 1;
  if (entry.subscribers > 0 || entry.settled) return;
  // Not right away: under StrictMode an effect is torn down and set up again
  // in the same tick, and the request should survive that.
  setTimeout(() => {
    if (entry.subscribers > 0 || entry.settled) return;
    if (store.get(key) === entry) store.delete(key);
    entry.controller.abort();
  }, 0);
}

/**
 * Forgets every answer the hooks remembered with their built-in clients.
 * Requests in flight are left alone.
 */
export function clearOmnillinkCache(): void {
  for (const [key, entry] of defaultStore) {
    if (entry.settled) defaultStore.delete(key);
  }
}
