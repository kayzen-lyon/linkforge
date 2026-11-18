'use client';

import {
  createElement,
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

// Types only: nothing of the element is loaded when this module is imported.
import type { LinkPreviewElement, LinkPreviewErrorDetail, LinkPreviewLoadDetail } from '@omnillink/sdk/element';

import { useOmnillinkConfig } from './context.js';

export type { LinkPreviewElement, LinkPreviewErrorDetail, LinkPreviewLoadDetail };

export interface LinkPreviewProps extends Omit<HTMLAttributes<HTMLElement>, 'onLoad' | 'onError' | 'children'> {
  /** Page to preview: an absolute `http(s)` URL. Anything else renders no card and makes no request. */
  readonly url: string;
  /** Origin of the Omnillink instance. Defaults to the nearest `<OmnillinkProvider>`, then to the origin of the page. */
  readonly baseUrl?: string;
  /** `compact` (default): thumbnail beside the text. `large`: image above the text. */
  readonly size?: 'compact' | 'large';
  /** `auto` (default) follows `prefers-color-scheme`. */
  readonly theme?: 'auto' | 'light' | 'dark';
  /** `lazy` (default) waits until the card is near the viewport. */
  readonly loading?: 'lazy' | 'eager';
  /** The metadata arrived and the card is displayed. */
  readonly onLoad?: (detail: LinkPreviewLoadDetail) => void;
  /** The preview could not be loaded; the fallback is displayed. `detail.error` is usually an `OmnillinkError`. */
  readonly onError?: (detail: LinkPreviewErrorDetail) => void;
  /**
   * Shown until the card is ready, and kept if it fails: on the server, before
   * JavaScript runs, when the API is down. Defaults to a plain link to `url`.
   */
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** The URL if it is absolute http(s) without credentials, else `null`. Same rule as the element. */
export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const http = url.protocol === 'http:' || url.protocol === 'https:';
    return http && url.username === '' && url.password === '' ? url.href : null;
  } catch {
    return null;
  }
}

let elementModule: Promise<unknown> | undefined;

/** Registers `<link-preview>`, once, in the browser only. */
function loadElement(): Promise<unknown> {
  elementModule ??= import('@omnillink/sdk/element').catch(() => {
    // The chunk failed to load: the fallback link stays; try again on the next mount.
    elementModule = undefined;
  });
  return elementModule;
}

function assign<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null) ref.current = value;
}

/**
 * A link card, rendered by the `<link-preview>` custom element of `@omnillink/sdk`.
 *
 * On the server, and until the element is registered in the browser, this is
 * its fallback: a plain link by default. The element is loaded in an effect,
 * so importing this module never touches `window`.
 */
export const LinkPreview = forwardRef<LinkPreviewElement, LinkPreviewProps>(function LinkPreview(
  { url, baseUrl, size, theme, loading, onLoad, onError, children, className, ...rest },
  ref,
) {
  const config = useOmnillinkConfig();
  const element = useRef<LinkPreviewElement | null>(null);
  const handlers = useRef({ onLoad, onError });
  handlers.current = { onLoad, onError };

  useEffect(() => {
    void loadElement();
  }, []);

  useEffect(() => {
    const node = element.current;
    if (node === null) return undefined;
    // The events bubble: only react to our own element, not to a nested card.
    const load = (event: Event): void => {
      if (event.target === node) handlers.current.onLoad?.((event as CustomEvent<LinkPreviewLoadDetail>).detail);
    };
    const error = (event: Event): void => {
      if (event.target === node) handlers.current.onError?.((event as CustomEvent<LinkPreviewErrorDetail>).detail);
    };
    node.addEventListener('link-preview:load', load);
    node.addEventListener('link-preview:error', error);
    return () => {
      node.removeEventListener('link-preview:load', load);
      node.removeEventListener('link-preview:error', error);
    };
  }, []);

  const href = safeHttpUrl(url);
  const fallback =
    children ?? (href === null ? url : createElement('a', { href, rel: 'noopener noreferrer' }, url));
  const origin = baseUrl ?? config.baseUrl;

  return createElement(
    'link-preview',
    {
      ...rest,
      ref: (node: LinkPreviewElement | null) => {
        element.current = node;
        assign(ref, node);
      },
      // Attributes, spelled as the element reads them: this is what both React 18
      // and 19 write for a custom element, on the server and in the browser.
      url,
      'base-url': origin === '' ? undefined : origin,
      size,
      theme,
      loading,
      class: className,
      // The element adds a `state` attribute to itself once it is upgraded.
      suppressHydrationWarning: true,
    },
    fallback,
  );
});
