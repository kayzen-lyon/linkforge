/**
 * Page insights: weight, requests, timings and the web vitals one headless
 * load can observe, plus the technologies seen while it ran.
 *
 * Everything reported here is a **lab measurement**: a single load, in a
 * data-centre headless browser, with a cold cache and no throttling. It is
 * not a field score (CrUX) and not a Lighthouse audit; it varies from one run
 * to the next. The schema and the docs say so next to every number.
 */
import { devices, type BrowserContextOptions } from 'playwright-core';

import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import type { TargetHeaders } from '../lib/target-headers.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import type { NetworkSummary } from './network-meter.js';
import { HTML_TYPES, snapshotHtml } from './page-loader.js';
import type { Renderer } from './renderer.js';
import { detectTechnologies, type TechDetection } from './tech-detector.js';
import { runTechProbe } from './tech-service.js';

export interface InsightsRequest {
  readonly url: string;
  readonly device: 'desktop' | 'mobile';
  readonly headers?: TargetHeaders | null;
  readonly force: boolean;
  readonly ttlSeconds: number | null;
}

export interface InsightsData {
  /** Final URL after redirects. */
  readonly url: string;
  readonly device: 'desktop' | 'mobile';
  /** Always `lab`: one load in a data-centre headless browser. */
  readonly measurement: 'lab';
  /** ISO 8601 time of the measurement. */
  readonly measuredAt: string;
  /** HTTP status of the document. */
  readonly status: number;
  /** False when the `load` event did not fire within the navigation budget. */
  readonly loaded: boolean;
  readonly timings: {
    readonly ttfbMs: number | null;
    readonly domContentLoadedMs: number | null;
    readonly loadMs: number | null;
  };
  readonly vitals: {
    readonly fcpMs: number | null;
    readonly lcpMs: number | null;
    /** Tag of the element that was the largest contentful paint. */
    readonly lcpElement: string | null;
    readonly cls: number | null;
  };
  readonly network: Omit<NetworkSummary, 'thirdPartyHosts' | 'thirdPartyRequests' | 'thirdPartyBytes'> & {
    readonly thirdParty: {
      readonly hostCount: number;
      readonly hosts: readonly string[];
      readonly requests: number;
      readonly transferBytes: number;
    };
  };
  readonly dom: { readonly elements: number | null };
  readonly technologies: readonly TechDetection[];
}

export interface InsightsResult {
  readonly data: InsightsData;
  readonly source: 'browser';
  readonly cached: boolean;
  readonly ttlSeconds: number;
}

const CONTEXTS: Readonly<Record<InsightsRequest['device'], BrowserContextOptions>> = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile: { ...devices['Pixel 7'] },
};

/** Time kept for reading the measurements once the page has settled. */
const READ_RESERVE_MS = 6000;
const CACHE_SHAPE = 1;

/**
 * Runs in the page; constant, takes no input. Reads Navigation Timing, paint
 * entries and the buffered `largest-contentful-paint` / `layout-shift`
 * entries. CLS is the largest session window (shifts less than 1 s apart, 5 s
 * at most), as the metric is defined.
 */
const VITALS_SCRIPT = `(async () => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByType('paint').find((entry) => entry.name === 'first-contentful-paint');
  const observe = (type) => new Promise((resolve) => {
    try {
      const entries = [];
      const observer = new PerformanceObserver((list) => { entries.push(...list.getEntries()); });
      observer.observe({ type, buffered: true });
      setTimeout(() => { entries.push(...observer.takeRecords()); observer.disconnect(); resolve(entries); }, 150);
    } catch { resolve(null); }
  });
  const [paints, shifts] = await Promise.all([observe('largest-contentful-paint'), observe('layout-shift')]);
  let cls = null;
  if (shifts !== null) {
    cls = 0;
    let windowValue = 0, windowStart = 0, previous = 0;
    for (const shift of shifts) {
      if (shift.hadRecentInput) continue;
      if (windowValue > 0 && shift.startTime - previous < 1000 && shift.startTime - windowStart < 5000) windowValue += shift.value;
      else { windowValue = shift.value; windowStart = shift.startTime; }
      previous = shift.startTime;
      cls = Math.max(cls, windowValue);
    }
  }
  const last = paints === null ? undefined : paints[paints.length - 1];
  return {
    ttfb: nav && nav.responseStart, dcl: nav && nav.domContentLoadedEventEnd, load: nav && nav.loadEventEnd,
    fcp: fcp && fcp.startTime, lcp: last && last.startTime,
    lcpElement: last && last.element ? String(last.element.tagName).toLowerCase() : null,
    cls, elements: document.getElementsByTagName('*').length,
  };
})()`;

/** A duration read from the page: finite, positive, below ten minutes; else `null`. */
function duration(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 600_000
    ? Math.round(value)
    : null;
}

export class InsightsService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Measures one load of a page.
   *
   * @throws {AppError} `ENOTHTML`, `ETARGETSTATUS`, plus the usual URL, network and browser errors.
   */
  async measure(request: InsightsRequest): Promise<InsightsResult> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const headers = request.headers ?? null;
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.metaTtlSeconds;
    const key = cacheKey('insights', {
      url: target.href,
      device: request.device,
      shape: CACHE_SHAPE,
      ...(headers !== null && { headers }),
    });
    if (!request.force) {
      const hit = await getJson<InsightsData>(this.cache, key);
      if (hit !== null) return { data: hit, source: 'browser', cached: true, ttlSeconds };
    }
    const data = await this.flights.run(key, async () => {
      const fresh = await this.load(target, request.device, headers, deadline);
      await setJson(this.cache, key, fresh, ttlSeconds);
      return fresh;
    });
    return { data, source: 'browser', cached: false, ttlSeconds };
  }

  private load(
    target: URL,
    device: InsightsRequest['device'],
    headers: TargetHeaders | null,
    deadline: Deadline,
  ): Promise<InsightsData> {
    return this.renderer.render(
      target,
      {
        waitUntil: 'load',
        settleMs: 3000,
        deadline,
        reserveMs: READ_RESERVE_MS,
        requestHeaders: headers,
        contextOptions: CONTEXTS[device],
      },
      async ({ page, context, response, loaded, network }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);
        const responseHeaders = response?.headers() ?? {};
        const contentType = responseHeaders['content-type']?.split(';')[0]?.trim().toLowerCase() ?? null;
        if (contentType !== null && !HTML_TYPES.has(contentType)) throw AppError.notHtml(contentType);

        const raw = (await Promise.race([
          page.evaluate(VITALS_SCRIPT).catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
        ])) as Record<string, unknown> | null;
        const html = await snapshotHtml(page, this.config.http.maxBodyBytes);
        const probe = await runTechProbe(page);
        const { 'set-cookie': _dropped, ...safeHeaders } = responseHeaders;
        const cookieNames = (await context.cookies().catch(() => [])).map((cookie) => cookie.name).slice(0, 100);
        const summary = network.summary(page.url());
        const cls = raw?.['cls'];
        const lcpElement = raw?.['lcpElement'];
        const elements = raw?.['elements'];

        return {
          url: page.url(),
          device,
          measurement: 'lab',
          measuredAt: new Date().toISOString(),
          status,
          loaded,
          timings: {
            ttfbMs: duration(raw?.['ttfb']),
            domContentLoadedMs: duration(raw?.['dcl']),
            loadMs: duration(raw?.['load']),
          },
          vitals: {
            fcpMs: duration(raw?.['fcp']),
            lcpMs: duration(raw?.['lcp']),
            lcpElement: typeof lcpElement === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(lcpElement) ? lcpElement : null,
            cls: typeof cls === 'number' && Number.isFinite(cls) && cls >= 0 && cls < 100 ? Math.round(cls * 1000) / 1000 : null,
          },
          network: {
            requests: summary.requests,
            transferBytes: summary.transferBytes,
            byType: summary.byType,
            thirdParty: {
              hostCount: summary.thirdPartyHosts.length,
              hosts: summary.thirdPartyHosts,
              requests: summary.thirdPartyRequests,
              transferBytes: summary.thirdPartyBytes,
            },
            limitReached: summary.limitReached,
          },
          dom: {
            elements: typeof elements === 'number' && Number.isInteger(elements) && elements >= 0 ? elements : null,
          },
          technologies: detectTechnologies(html, safeHeaders, cookieNames, { probe }),
        };
      },
    );
  }
}
