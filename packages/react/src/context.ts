'use client';

import { createContext, createElement, useContext, useMemo, type ReactElement, type ReactNode } from 'react';

export interface OmnillinkContextValue {
  /** Origin of the Omnillink instance; `''` means the origin of the page. */
  readonly baseUrl: string;
}

const OmnillinkContext = createContext<OmnillinkContextValue>({ baseUrl: '' });

export interface OmnillinkProviderProps {
  /** Origin of the Omnillink instance, e.g. `https://links.example.com`. */
  readonly baseUrl: string;
  readonly children?: ReactNode;
}

/**
 * Sets the instance every `<LinkPreview>` and `useLinkMeta()` below it talks
 * to, so `baseUrl` does not have to be repeated on each of them.
 */
export function OmnillinkProvider({ baseUrl, children }: OmnillinkProviderProps): ReactElement {
  const value = useMemo(() => ({ baseUrl }), [baseUrl]);
  return createElement(OmnillinkContext.Provider, { value }, children);
}

export function useOmnillinkConfig(): OmnillinkContextValue {
  return useContext(OmnillinkContext);
}
