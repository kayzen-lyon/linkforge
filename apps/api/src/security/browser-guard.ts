/**
 * SSRF guard for headless-browser sessions.
 *
 * A rendered page issues requests of its own (sub-resources, XHR, redirects,
 * iframes). Each one is intercepted and validated with the same policy as the
 * raw HTTP fetcher, otherwise a public page could simply redirect or embed
 * `http://169.254.169.254/`.
 *
 * ⚠️ Known limitation: Chromium resolves DNS by itself after our check, so a
 * determined attacker controlling a DNS server could still attempt a rebinding
 * race here. Production deployments MUST add network-level egress filtering
 * (see ROADMAP, phase 2: validating forward proxy / firewall rules).
 */
import type { BrowserContext, Route } from 'playwright';

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
