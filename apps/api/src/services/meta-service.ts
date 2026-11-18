/**
 * Metadata orchestration: cache → raw HTTP → (if needed) headless browser.
 */
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import type { SafeFetcher } from './fetcher.js';
import {
  extractMetadata,
  mergeMetadata,
  needsBrowserRender,
  type LinkMetadata,
} from './meta-extractor.js';
import type { Renderer } from './renderer.js';

/**
 * - `auto`: raw HTTP first, browser only when the result is too poor (default).
 * - `never`: raw HTTP only (fastest, cheapest).
 * - `always`: always render in the browser (JavaScript-heavy sites).
 */
export type RenderMode = 'auto' | 'never' | 'always';

export interface MetaRequest {
  readonly url: string;
  readonly render: RenderMode;
  /** Bypass the cache read (the fresh result is still written back). */
  readonly force: boolean;
}

export interface MetaResult {
  readonly data: LinkMetadata & { readonly contentType: string | null };
  /** Which pipeline produced the data. */
  readonly source: 'http' | 'browser';
  readonly cached: boolean;
}

type CachedMeta = Omit<MetaResult, 'cached'>;

/** Statuses typically returned by anti-bot layers to non-browser clients. */
const BOT_WALL_STATUSES = new Set([401, 403, 406, 429, 503]);
/** Resources that are useless for DOM extraction and slow rendering down. */
const HEAVY_RESOURCES = ['image', 'media', 'font'] as const;

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
    image: null,
    images: [],
    favicon: null,
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
   *   unreachable target, target HTTP error, saturated browser pool.
   */
  async getMetadata(request: MetaRequest): Promise<MetaResult> {
    // Cheap synchronous validation first: bad input never touches the cache or the network.
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const key = cacheKey('meta', { url: target.href, render: request.render });

    if (!request.force) {
      const hit = await getJson<CachedMeta>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true };
    }

    const fresh = await this.flights.run(key, async () => {
      const result = await this.compute(target, request.render);
      await setJson(this.cache, key, result, this.config.cache.metaTtlSeconds);
      return result;
    });
    return { ...fresh, cached: false };
  }

  private async compute(target: URL, render: RenderMode): Promise<CachedMeta> {
    if (render === 'always') return this.viaBrowser(target, null);

    const doc = await this.fetcher.fetchDocument(target);

    if (doc.status >= 400) {
      if (render === 'auto' && BOT_WALL_STATUSES.has(doc.status)) {
        return this.viaBrowser(target, null);
      }
      throw AppError.targetStatus(doc.status);
    }

    // Non-HTML resource (image, PDF, video...): report what we know about it.
    if (doc.html === null) {
      const fileName = decodeURIComponent(new URL(doc.finalUrl).pathname.split('/').pop() ?? '');
      return {
        data: {
          ...emptyMetadata(doc.finalUrl),
          title: fileName === '' ? null : fileName,
          contentType: doc.contentType,
        },
        source: 'http',
      };
    }

    const metadata = extractMetadata(doc.html, doc.finalUrl);
    if (render === 'never' || !needsBrowserRender(metadata, doc.html)) {
      return { data: { ...metadata, contentType: doc.contentType }, source: 'http' };
    }

    try {
      return await this.viaBrowser(target, metadata);
    } catch (error) {
      // The static pass produced *something*: a degraded answer beats an error.
      if (metadata.title !== null) {
        return { data: { ...metadata, contentType: doc.contentType }, source: 'http' };
      }
      throw error;
    }
  }

  /** Renders the page in Chromium and extracts metadata from the live DOM. */
  private async viaBrowser(target: URL, staticPass: LinkMetadata | null): Promise<CachedMeta> {
    return this.renderer.render(
      target,
      {
        waitUntil: 'domcontentloaded',
        settleMs: 4000,
        guard: { blockResourceTypes: HEAVY_RESOURCES },
        contextOptions: { viewport: { width: 1280, height: 800 } },
      },
      async ({ page, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);

        const rendered = extractMetadata(await page.content(), page.url());
        const contentType =
          response?.headers()['content-type']?.split(';')[0]?.trim().toLowerCase() ?? null;
        return {
          data: {
            ...(staticPass === null ? rendered : mergeMetadata(rendered, staticPass)),
            contentType,
          },
          source: 'browser' as const,
        };
      },
    );
  }
}
