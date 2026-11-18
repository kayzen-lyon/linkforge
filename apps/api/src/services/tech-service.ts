/**
 * Technology detection orchestration: cache → raw HTTP (+ first-party
 * bundles) → headless browser with the built-in probe when asked or needed.
 */
import type { Page } from 'playwright-core';

import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError, ErrorCode, findAppError } from '../lib/errors.js';
import type { TargetHeaders } from '../lib/target-headers.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import type { SafeFetcher } from './fetcher.js';
import {
  BOT_WALL_STATUSES,
  domRenderOptions,
  HTML_TYPES,
  looksLikeEmptyShell,
  snapshotHtml,
  type RenderMode,
} from './page-loader.js';
import type { Renderer } from './renderer.js';
import {
  detectTechnologies,
  pickBundles,
  PROBE_GLOBALS,
  probeInPage,
  sanitizeProbe,
  type TechBundle,
  type TechDetection,
  type TechProbe,
} from './tech-detector.js';

export interface TechRequest {
  readonly url: string;
  readonly render: RenderMode;
  readonly headers?: TargetHeaders | null;
  readonly force: boolean;
  readonly ttlSeconds: number | null;
}

export interface TechData {
  /** Final URL after redirects. */
  readonly url: string;
  readonly technologies: readonly TechDetection[];
  /** What the detection looked at, so an absence can be read for what it is. */
  readonly inspected: {
    /** First-party scripts and stylesheets read for runtime markers. */
    readonly bundles: number;
    /** Whether the rendered DOM and the in-page probe were used. */
    readonly rendered: boolean;
  };
}

export interface TechResult {
  readonly data: TechData;
  readonly source: 'http' | 'browser';
  readonly cached: boolean;
  readonly ttlSeconds: number;
}

type CachedTech = Pick<TechResult, 'data' | 'source'>;

/** First-party bundles read per page, and how much of each. */
export const TECH_MAX_BUNDLES = 4;
const BUNDLE_MAX_BYTES = 1_500_000;
/** Longest the in-page probe may take: it only reads properties. */
const PROBE_TIMEOUT_MS = 3000;
/** Bump when `TechData` or the signature semantics change. */
const CACHE_SHAPE = 2;

/**
 * Runs the built-in probe in a rendered page. Never throws: a page that
 * breaks the probe is simply not probed.
 */
export async function runTechProbe(page: Page): Promise<TechProbe> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const raw = await Promise.race([
      page.evaluate(probeInPage, PROBE_GLOBALS),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
      }),
    ]);
    return sanitizeProbe(raw);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

interface StaticPass {
  readonly html: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly cookieNames: readonly string[];
  readonly bundles: readonly TechBundle[];
}

export class TechService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly fetcher: SafeFetcher,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Technologies of a page.
   *
   * `never`: response headers, markup and first-party bundles. `always`: the
   * rendered DOM and the built-in probe as well. `auto`: the browser only when
   * the static markup is an empty shell in which no framework was recognised.
   *
   * @throws {AppError} `ENOTHTML`, `ETARGETSTATUS`, plus the usual URL, network and browser errors.
   */
  async detect(request: TechRequest): Promise<TechResult> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const headers = request.headers ?? null;
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.metaTtlSeconds;
    const key = cacheKey('tech', {
      url: target.href,
      render: request.render,
      shape: CACHE_SHAPE,
      ...(headers !== null && { headers }),
    });
    if (!request.force) {
      const hit = await getJson<CachedTech>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true, ttlSeconds };
    }
    const fresh = await this.flights.run(key, async () => {
      const result = await this.compute(target, request.render, headers, deadline);
      await setJson(this.cache, key, result, ttlSeconds);
      return result;
    });
    return { ...fresh, cached: false, ttlSeconds };
  }

  private async compute(
    target: URL,
    render: RenderMode,
    headers: TargetHeaders | null,
    deadline: Deadline,
  ): Promise<CachedTech> {
    if (render === 'always') return this.viaBrowser(target, headers, deadline, null);

    const doc = await this.fetcher.fetchBytes(target, {
      maxBytes: this.config.http.maxBodyBytes,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      headers,
    });
    if (doc.status >= 400) {
      if (render === 'auto' && BOT_WALL_STATUSES.has(doc.status)) {
        return this.viaBrowser(target, headers, deadline, null);
      }
      // Headers of an error page still identify the stack, but its markup is not the site's.
      throw AppError.targetStatus(doc.status);
    }
    if (doc.contentType !== null && !HTML_TYPES.has(doc.contentType)) {
      throw AppError.notHtml(doc.contentType);
    }
    const html = doc.body.toString('utf8');
    const pass: StaticPass = {
      html,
      url: doc.finalUrl,
      headers: doc.headers,
      cookieNames: doc.cookieNames,
      bundles: await this.readBundles(html, doc.finalUrl, deadline),
    };
    const technologies = detectTechnologies(html, pass.headers, pass.cookieNames, { bundles: pass.bundles });
    const staticResult: CachedTech = {
      data: { url: pass.url, technologies, inspected: { bundles: pass.bundles.length, rendered: false } },
      source: 'http',
    };
    if (render === 'never') return staticResult;

    // A shell whose framework is still unknown: only the running page can tell.
    const knowsRuntime = technologies.some(
      (tech) => (tech.category === 'framework' || tech.category === 'library') && tech.confidence !== 'low',
    );
    if (knowsRuntime || !/<script\b/i.test(html) || !looksLikeEmptyShell(html)) return staticResult;
    try {
      return await this.viaBrowser(target, headers, deadline, pass);
    } catch (error) {
      if (findAppError(error)?.code === ErrorCode.ForbiddenUrl) throw error;
      // The static pass is a complete answer of its own: degrade rather than fail.
      return staticResult;
    }
  }

  /** Reads the first-party bundles of a page. A bundle that cannot be read is skipped. */
  private async readBundles(html: string, documentUrl: string, deadline: Deadline): Promise<TechBundle[]> {
    // Not worth starting fetches that the deadline would cut.
    if (deadline.remaining() < this.config.http.timeoutMs + 3000) return [];
    const urls = pickBundles(html, documentUrl, TECH_MAX_BUNDLES);
    const read = await Promise.all(
      urls.map(async (url): Promise<TechBundle | null> => {
        try {
          // Same origin as the page, yet validated like any target: the origin may redirect.
          const file = await this.fetcher.fetchBytes(parseTargetUrl(url, this.config.ssrf), {
            maxBytes: BUNDLE_MAX_BYTES,
            accept: '*/*',
          });
          if (file.status !== 200 || HTML_TYPES.has(file.contentType ?? '')) return null;
          return { url, text: file.body.toString('utf8') };
        } catch {
          return null;
        }
      }),
    );
    return read.filter((bundle): bundle is TechBundle => bundle !== null);
  }

  private async viaBrowser(
    target: URL,
    headers: TargetHeaders | null,
    deadline: Deadline,
    staticPass: StaticPass | null,
  ): Promise<CachedTech> {
    const rendered = await this.renderer.render(
      target,
      domRenderOptions(deadline, null, headers),
      async ({ page, context, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);
        const responseHeaders = response?.headers() ?? {};
        const contentType = responseHeaders['content-type']?.split(';')[0]?.trim().toLowerCase() ?? null;
        if (contentType !== null && !HTML_TYPES.has(contentType)) throw AppError.notHtml(contentType);
        const { 'set-cookie': _dropped, ...safeHeaders } = responseHeaders;
        return {
          html: await snapshotHtml(page, this.config.http.maxBodyBytes),
          url: page.url(),
          headers: safeHeaders,
          // Names only: a cookie value never leaves the browser context.
          cookieNames: (await context.cookies().catch(() => [])).map((cookie) => cookie.name).slice(0, 100),
          probe: await runTechProbe(page),
        };
      },
    );
    const bundles = staticPass?.bundles ?? (await this.readBundles(rendered.html, rendered.url, deadline));
    return {
      data: {
        url: rendered.url,
        technologies: detectTechnologies(
          rendered.html,
          { ...staticPass?.headers, ...rendered.headers },
          [...new Set([...(staticPass?.cookieNames ?? []), ...rendered.cookieNames])],
          { bundles, probe: rendered.probe },
        ),
        inspected: { bundles: bundles.length, rendered: true },
      },
      source: 'browser',
    };
  }
}
