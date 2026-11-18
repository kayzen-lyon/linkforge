/**
 * Metadata orchestration: cache → raw HTTP → (if needed) headless browser.
 */
import type { AppConfig } from '../config.js';
import { detectBlockPage } from '../lib/block-page.js';
import { Deadline } from '../lib/deadline.js';
import { AppError, ErrorCode, findAppError } from '../lib/errors.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import type { SafeFetcher } from './fetcher.js';
import {
  domainOf,
  extractMetadata,
  mergeMetadata,
  needsBrowserRender,
  type LinkMetadata,
} from './meta-extractor.js';
import {
  BOT_WALL_STATUSES,
  domRenderOptions,
  snapshotHtml,
  type RenderMode,
} from './page-loader.js';
import type { Renderer } from './renderer.js';

export type { RenderMode } from './page-loader.js';

export interface MetaRequest {
  readonly url: string;
  readonly render: RenderMode;
  /** Bypass the cache read (the fresh result is still written back). */
  readonly force: boolean;
  /** Cache lifetime for this request; `null` uses the configured default. */
  readonly ttlSeconds: number | null;
}

export interface MetaResult {
  readonly data: LinkMetadata & { readonly contentType: string | null };
  /** Which pipeline produced the data. */
  readonly source: 'http' | 'browser';
  readonly cached: boolean;
  /** Lifetime applied to this answer (drives `Cache-Control`). */
  readonly ttlSeconds: number;
}

type CachedMeta = Pick<MetaResult, 'data' | 'source'>;

/**
 * Version of the cached payload's shape. Bump it whenever `LinkMetadata`
 * changes, so entries written by an older deployment (shared Redis) are not
 * served with fields missing.
 */
const CACHE_SHAPE = 3;

function emptyMetadata(url: string): LinkMetadata {
  return {
    url,
    canonicalUrl: null,
    title: null,
    description: null,
    author: null,
    publisher: null,
    lang: null,
    date: null,
    dateModified: null,
    type: null,
    themeColor: null,
    robots: null,
    oembed: null,
    alternates: [],
    twitter: { card: null, site: null },
    paywalled: null,
    domain: domainOf(url),
    image: null,
    images: [],
    favicon: null,
    logo: null,
    video: null,
    audio: null,
    keywords: [],
    feeds: [],
    jsonLd: [],
  };
}

export class MetaService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly fetcher: SafeFetcher,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Returns link-preview metadata for a URL.
   *
   * @throws {AppError} See {@link ErrorCode} — invalid/forbidden URL, timeout,
   *   unreachable target, target HTTP error, block page, saturated browser pool.
   */
  async getMetadata(request: MetaRequest): Promise<MetaResult> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    // Cheap synchronous validation first: bad input never touches the cache or the network.
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.metaTtlSeconds;
    const key = cacheKey('meta', {
      url: target.href,
      render: request.render,
      shape: CACHE_SHAPE,
    });

    if (!request.force) {
      const hit = await getJson<CachedMeta>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true, ttlSeconds };
    }

    const fresh = await this.flights.run(key, async () => {
      // A block page throws, so it never reaches the cache.
      const result = await this.compute(target, request.render, deadline);
      await setJson(this.cache, key, result, ttlSeconds);
      return result;
    });
    return { ...fresh, cached: false, ttlSeconds };
  }

  private async compute(target: URL, render: RenderMode, deadline: Deadline): Promise<CachedMeta> {
    if (render === 'always') return this.viaBrowser(target, null, deadline);

    const doc = await this.fetcher.fetchDocument(target);

    if (doc.status >= 400) {
      if (render === 'auto' && BOT_WALL_STATUSES.has(doc.status)) {
        return this.viaBrowser(target, null, deadline);
      }
      throw AppError.targetStatus(doc.status);
    }

    // Non-HTML resource (image, PDF, video...): report what we know about it.
    if (doc.html === null) {
      const fileName = decodeURIComponent(new URL(doc.finalUrl).pathname.split('/').pop() ?? '');
      const image = doc.contentType?.startsWith('image/')
        ? { url: doc.finalUrl, width: null, height: null, type: doc.contentType, alt: null }
        : null;
      return {
        data: {
          ...emptyMetadata(doc.finalUrl),
          title: fileName === '' ? null : fileName,
          image,
          images: image === null ? [] : [image],
          contentType: doc.contentType,
        },
        source: 'http',
      };
    }

    const verdict = detectBlockPage(doc.html);
    if (verdict.blocked) {
      if (render === 'never') throw AppError.blocked(verdict.reason ?? 'block page');
      // A real browser passes many challenges; if it does not, it reports EBLOCKED itself.
      return this.viaBrowser(target, null, deadline);
    }

    const metadata = extractMetadata(doc.html, doc.finalUrl);
    if (render === 'never' || !needsBrowserRender(metadata, doc.html)) {
      return { data: { ...metadata, contentType: doc.contentType }, source: 'http' };
    }

    try {
      return await this.viaBrowser(target, metadata, deadline);
    } catch (error) {
      // A forbidden destination found while rendering is a verdict, not a glitch.
      if (findAppError(error)?.code === ErrorCode.ForbiddenUrl) throw error;
      // The static pass produced *something*: a degraded answer beats an error.
      if (metadata.title !== null) {
        return { data: { ...metadata, contentType: doc.contentType }, source: 'http' };
      }
      throw error;
    }
  }

  /** Renders the page in Chromium and extracts metadata from the live DOM. */
  private async viaBrowser(
    target: URL,
    staticPass: LinkMetadata | null,
    deadline: Deadline,
  ): Promise<CachedMeta> {
    return this.renderer.render(target, domRenderOptions(deadline), async ({ page, response }) => {
      const status = response?.status() ?? 200;
      // Same cap as the raw fetcher: a page must not grow the DOM without bound.
      const html = await snapshotHtml(page, this.config.http.maxBodyBytes);
      const verdict =
        status < 400 || BOT_WALL_STATUSES.has(status) ? detectBlockPage(html) : { blocked: false, reason: null };
      if (verdict.blocked) throw AppError.blocked(verdict.reason ?? 'block page');
      if (status >= 400) throw AppError.targetStatus(status);

      const rendered = extractMetadata(html, page.url());
      const contentType =
        response?.headers()['content-type']?.split(';')[0]?.trim().toLowerCase() ?? null;
      return {
        data: {
          ...(staticPass === null ? rendered : mergeMetadata(rendered, staticPass)),
          contentType,
        },
        source: 'browser' as const,
      };
    });
  }
}
