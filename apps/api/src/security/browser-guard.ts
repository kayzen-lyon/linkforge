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
  /** Drop requests to well-known advertising and tracking hosts. */
  readonly blockAds?: boolean;
}

/**
 * Registrable domains of widespread ad servers, trackers and tag managers.
 * Deliberately short and hand-written: a few dozen suffix comparisons per
 * request cost nothing, where a full filter-list engine would add megabytes
 * to the function bundle and to its cold start. A request is dropped when its
 * host is one of these or a sub-domain of one.
 */
const AD_TRACKER_DOMAINS: ReadonlySet<string> = new Set([
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'googletagmanager.com', 'googletagservices.com', 'adservice.google.com', 'amazon-adsystem.com',
  'adnxs.com', 'adsrvr.org', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
  'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com', 'moatads.com',
  'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'mixpanel.com', 'segment.io',
  'segment.com', 'fullstory.com', 'mouseflow.com', 'clarity.ms', 'bat.bing.com',
  'connect.facebook.net', 'analytics.tiktok.com', 'ads-twitter.com', 'analytics.twitter.com',
  'snap.licdn.com', 'px.ads.linkedin.com', 'adform.net', 'smartadserver.com', 'teads.tv',
  'bidswitch.net', '3lift.com', 'sharethrough.com', 'yieldmo.com', 'media.net', 'zedo.com',
  'chartbeat.com', 'newrelic.com', 'nr-data.net', 'optimizely.com', 'matomo.cloud',
  'plausible.io', 'stats.wp.com', 'pixel.wp.com', 'amplitude.com', 'heap.io', 'crazyegg.com',
]);

/** Tells whether `rawUrl` points to a known advertising or tracking host. */
export function isAdOrTracker(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  // `a.b.example.com` → `a.b.example.com`, `b.example.com`, `example.com`
  for (let dot = -1; ; ) {
    const candidate = host.slice(dot + 1);
    if (AD_TRACKER_DOMAINS.has(candidate)) return true;
    dot = host.indexOf('.', dot + 1);
    if (dot === -1) return false;
  }
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
  const blockAds = options.blockAds ?? false;
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
      // Never the document itself: an ad host asked for by the client is the client's choice.
      const isDocument = request.isNavigationRequest() && request.frame().parentFrame() === null;
      if (blockedTypes.has(request.resourceType()) || (blockAds && !isDocument && isAdOrTracker(request.url()))) {
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
