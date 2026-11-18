/**
 * Request interception for headless-browser sessions: the first of two layers.
 *
 * A rendered page issues requests of its own (sub-resources, XHR, iframes,
 * client-side navigations). Each one is intercepted here and validated with
 * the same policy as the raw HTTP fetcher, which refuses forbidden URLs early,
 * tells the renderer when the top-level navigation was refused, and lets a job
 * drop whole resource types (images, fonts) for speed.
 *
 * What this layer does NOT see: Chromium follows HTTP redirects without
 * calling the handler again, and resolves DNS by itself after our check. Both
 * are enforced by the second layer, the validating proxy every connection of
 * the browser goes through (`egress-proxy.ts`). This file alone is not a
 * sufficient SSRF defence.
 */
import type { BrowserContext, Route } from 'playwright-core';

import type { SsrfPolicy } from '../config.js';
import { assertSafeUrl } from './ssrf.js';

export interface BrowserGuardOptions {
  /** Resource types to drop for speed (e.g. images when only the DOM matters). */
  readonly blockResourceTypes?: readonly string[];
}

export interface BrowserGuard {
  /** True when the top-level navigation itself was refused by the policy. */
  readonly navigationBlocked: boolean;
}

/** Schemes that never leave the browser process and are therefore harmless. */
const INERT_SCHEMES = ['data:', 'blob:', 'about:'];

/**
 * Installs request interception on a browser context.
 *
 * Verdicts are memoised per origin for the lifetime of the context, so a page
 * with 80 requests to the same CDN triggers a single DNS check.
 */
export async function installBrowserGuard(
  context: BrowserContext,
  policy: SsrfPolicy,
  options: BrowserGuardOptions = {},
): Promise<BrowserGuard> {
  const verdicts = new Map<string, Promise<boolean>>();
  const blockedTypes = new Set(options.blockResourceTypes ?? []);
  const state = { navigationBlocked: false };

  const isAllowed = (rawUrl: string): Promise<boolean> => {
    if (INERT_SCHEMES.some((scheme) => rawUrl.startsWith(scheme))) return Promise.resolve(true);
    let origin: string;
    try {
      origin = new URL(rawUrl).origin;
    } catch {
      return Promise.resolve(false);
    }
    let verdict = verdicts.get(origin);
    if (verdict === undefined) {
      verdict = assertSafeUrl(rawUrl, policy).then(
        () => true,
        () => false,
      );
      verdicts.set(origin, verdict);
    }
    return verdict;
  };

  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    try {
      if (blockedTypes.has(request.resourceType())) {
        await route.abort('blockedbyclient');
        return;
      }
      if (await isAllowed(request.url())) {
        await route.continue();
        return;
      }
      if (request.isNavigationRequest() && request.frame().parentFrame() === null) {
        state.navigationBlocked = true;
      }
      await route.abort('blockedbyclient');
    } catch {
      // The page or context was closed while we were deciding: nothing to do.
    }
  });

  // WebSockets bypass `route()`; previews and screenshots never need them.
  await context.routeWebSocket(/.*/, (ws) => {
    void ws.close();
  });

  return {
    get navigationBlocked() {
      return state.navigationBlocked;
    },
  };
}
