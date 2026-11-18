/**
 * Small page tools built on the safe fetch paths: tables, oEmbed resolution
 * and favicon selection.
 */
import { load } from 'cheerio';

import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import { readImageHeader } from '../lib/image-header.js';
import { assertCssSelector } from '../lib/selectors.js';
import type { TargetHeaders } from '../lib/target-headers.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import type { SafeFetcher } from './fetcher.js';
import { extractMetadata } from './meta-extractor.js';
import type { PageLoader, RenderMode } from './page-loader.js';
import { extractTables, type PageTables } from './table-extractor.js';

interface Cacheable {
  readonly headers?: TargetHeaders | null;
  readonly force: boolean;
  readonly ttlSeconds: number | null;
}

export interface Answer<T> {
  readonly data: T;
  readonly source: 'http' | 'browser';
  readonly cached: boolean;
  readonly ttlSeconds: number;
}

export interface TablesData extends PageTables {
  /** Final URL of the document. */
  readonly url: string;
}

export interface OembedData {
  /** The page the embed describes (final URL). */
  readonly url: string;
  /** The oEmbed endpoint that was read. */
  readonly endpoint: string;
  readonly type: 'photo' | 'video' | 'link' | 'rich' | null;
  readonly version: string | null;
  readonly title: string | null;
  readonly authorName: string | null;
  readonly authorUrl: string | null;
  readonly providerName: string | null;
  readonly providerUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly thumbnailWidth: number | null;
  readonly thumbnailHeight: number | null;
  readonly width: number | null;
  readonly height: number | null;
  /** `photo` only: URL of the image. */
  readonly photoUrl: string | null;
  /** Untrusted third-party markup, returned as an inert string. Never interpreted here. */
  readonly html: string | null;
  readonly cacheAge: number | null;
}

export interface FaviconCandidate {
  readonly url: string;
  /** Where it was declared: `icon`, `apple-touch-icon`, `manifest` or `default` (`/favicon.ico`). */
  readonly rel: 'icon' | 'apple-touch-icon' | 'manifest' | 'default';
  /** `sizes` as declared by the page, if any. */
  readonly declaredSizes: string | null;
  /** `png`, `jpeg`, `gif`, `webp`, `ico` or `svg`; `null` when the file is not a readable image. */
  readonly format: string | null;
  readonly contentType: string | null;
  /** Real pixel size read from the file; `null` for a vector icon. */
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
}

export interface FaviconData {
  readonly pageUrl: string;
  /** The largest readable raster icon, else a vector one. */
  readonly icon: FaviconCandidate;
  /** Every icon that could be read, largest first. */
  readonly icons: readonly FaviconCandidate[];
}

/** Largest oEmbed document read, and largest `html` returned. */
const OEMBED_MAX_BYTES = 512 * 1024;
export const OEMBED_MAX_HTML = 100_000;
/** Icons measured per page, and bytes read of each. */
export const FAVICON_MAX_CANDIDATES = 8;
const ICON_HEADER_BYTES = 128 * 1024;
const MANIFEST_MAX_BYTES = 256 * 1024;

const str = (value: unknown, max = 500): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null;
/** oEmbed providers send dimensions as numbers or numeric strings. */
const int = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,6}$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isInteger(number) && number >= 0 && number <= 100_000 ? number : null;
};
const httpUrl = (value: unknown, base: string): string | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

export class PageToolsService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly fetcher: SafeFetcher,
    private readonly loader: PageLoader,
  ) {}

  private async cached<T>(
    namespace: string,
    parts: Readonly<Record<string, unknown>>,
    request: Cacheable,
    compute: () => Promise<Pick<Answer<T>, 'data' | 'source'>>,
  ): Promise<Answer<T>> {
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.metaTtlSeconds;
    const key = cacheKey(namespace, { ...parts, ...(request.headers != null && { headers: request.headers }) });
    if (!request.force) {
      const hit = await getJson<Pick<Answer<T>, 'data' | 'source'>>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true, ttlSeconds };
    }
    const fresh = await this.flights.run(key, async () => {
      const result = await compute();
      await setJson(this.cache, key, result, ttlSeconds);
      return result;
    });
    return { ...fresh, cached: false, ttlSeconds };
  }

  /**
   * Data tables of a page.
   *
   * @throws {AppError} `ENOTHTML`, `EINVALIDPARAMS` for a bad selector, plus the usual URL and network errors.
   */
  tables(
    request: Cacheable & { url: string; render: RenderMode; selector: string | null },
  ): Promise<Answer<TablesData>> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const selector = request.selector === null ? null : assertCssSelector(request.selector, 'selector');
    return this.cached('tables', { url: target.href, render: request.render, selector }, request, async () => {
      const page = await this.loader.load(target, {
        render: request.render,
        deadline,
        headers: request.headers ?? null,
        // `auto` reaches for the browser only when the static markup holds no table at all.
        isSufficient: (candidate) => extractTables(candidate.html, selector).total > 0,
      });
      return { data: { url: page.url, ...extractTables(page.html, selector) }, source: page.source };
    });
  }

  /**
   * Resolves the oEmbed document a page advertises.
   *
   * The discovery link and everything in the answer are third-party data: the
   * endpoint is fetched through the same validated path as any target, and
   * `html` is returned as a string, never rendered.
   *
   * @throws {AppError} `EEMBEDNOTFOUND` when the page advertises no oEmbed
   *   endpoint or the endpoint does not answer a usable document.
   */
  oembed(
    request: Cacheable & { url: string; maxWidth: number | null; maxHeight: number | null },
  ): Promise<Answer<OembedData>> {
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const { maxWidth, maxHeight } = request;
    return this.cached('oembed', { url: target.href, maxWidth, maxHeight }, request, async () => {
      const doc = await this.fetcher.fetchDocument(target, request.headers ?? null);
      if (doc.status >= 400) throw AppError.targetStatus(doc.status);
      if (doc.html === null) throw AppError.notHtml(doc.contentType);
      const advertised = extractMetadata(doc.html, doc.finalUrl).oembed;
      if (advertised === null) throw AppError.embedNotFound('The page advertises no oEmbed endpoint');

      // The link is written by the page: validated like any target, each redirect included.
      const endpoint = parseTargetUrl(advertised, this.config.ssrf);
      if (maxWidth !== null) endpoint.searchParams.set('maxwidth', String(maxWidth));
      if (maxHeight !== null) endpoint.searchParams.set('maxheight', String(maxHeight));
      const file = await this.fetcher.fetchBytes(endpoint, {
        maxBytes: OEMBED_MAX_BYTES,
        accept: 'application/json,text/xml;q=0.8,*/*;q=0.5',
      });
      if (file.status >= 400 || file.truncated) {
        throw AppError.embedNotFound(
          file.truncated ? 'The oEmbed document is over the size limit' : `The oEmbed endpoint answered HTTP ${file.status}`,
        );
      }
      const raw = this.parseOembed(file.body.toString('utf8'));
      if (raw === null) throw AppError.embedNotFound('The oEmbed endpoint did not answer an oEmbed document');

      const type = str(raw['type'], 20)?.toLowerCase() ?? null;
      const html = typeof raw['html'] === 'string' && raw['html'] !== '' ? raw['html'].slice(0, OEMBED_MAX_HTML) : null;
      return {
        data: {
          url: doc.finalUrl,
          endpoint: file.finalUrl,
          type: type === 'photo' || type === 'video' || type === 'link' || type === 'rich' ? type : null,
          version: str(typeof raw['version'] === 'number' ? String(raw['version']) : raw['version'], 10),
          title: str(raw['title']),
          authorName: str(raw['author_name']),
          authorUrl: httpUrl(raw['author_url'], file.finalUrl),
          providerName: str(raw['provider_name']),
          providerUrl: httpUrl(raw['provider_url'], file.finalUrl),
          thumbnailUrl: httpUrl(raw['thumbnail_url'], file.finalUrl),
          thumbnailWidth: int(raw['thumbnail_width']),
          thumbnailHeight: int(raw['thumbnail_height']),
          width: int(raw['width']),
          height: int(raw['height']),
          photoUrl: type === 'photo' ? httpUrl(raw['url'], file.finalUrl) : null,
          html,
          cacheAge: int(raw['cache_age']),
        },
        source: 'http',
      };
    });
  }

  /** Reads an oEmbed answer, JSON or XML, into a flat record of its top-level values. */
  private parseOembed(body: string): Record<string, unknown> | null {
    const text = body.trim();
    if (text.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    if (!text.startsWith('<')) return null;
    const $ = load(text, { xml: true });
    const root = $('oembed').first();
    if (root.length === 0) return null;
    const record: Record<string, unknown> = {};
    root.children().each((_, element) => {
      if (element.type === 'tag') record[element.name.toLowerCase()] = $(element).text();
    });
    return record;
  }

  /**
   * Best icon of a site, with its real dimensions read from the file.
   *
   * @throws {AppError} `EEMBEDNOTFOUND` when no declared or default icon is a readable image.
   */
  favicon(request: Cacheable & { url: string }): Promise<Answer<FaviconData>> {
    const target = parseTargetUrl(request.url, this.config.ssrf);
    return this.cached('favicon', { url: target.href }, request, async () => {
      const doc = await this.fetcher.fetchDocument(target, request.headers ?? null);
      if (doc.status >= 400) throw AppError.targetStatus(doc.status);
      const pageUrl = doc.finalUrl;
      const declared = doc.html === null ? [] : await this.declaredIcons(doc.html, pageUrl);
      const candidates = [
        ...declared,
        { url: new URL('/favicon.ico', pageUrl).href, rel: 'default' as const, declaredSizes: null },
      ]
        .filter((candidate, index, all) => all.findIndex((other) => other.url === candidate.url) === index)
        .slice(0, FAVICON_MAX_CANDIDATES);

      const measured = (await Promise.all(candidates.map((candidate) => this.measureIcon(candidate)))).filter(
        (icon): icon is FaviconCandidate => icon !== null,
      );
      if (measured.length === 0) throw AppError.embedNotFound('No readable icon was found for this site');
      // Largest real raster first; vector icons after them (no pixel size to compare).
      const icons = measured.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
      const [icon] = icons;
      if (icon === undefined) throw AppError.embedNotFound('No readable icon was found for this site');
      return { data: { pageUrl, icon, icons }, source: 'http' };
    });
  }

  /** Icons a document declares: `<link rel="icon">`, `apple-touch-icon`, and the web app manifest. */
  private async declaredIcons(
    html: string,
    pageUrl: string,
  ): Promise<Array<Pick<FaviconCandidate, 'url' | 'rel' | 'declaredSizes'>>> {
    const $ = load(html);
    const icons: Array<Pick<FaviconCandidate, 'url' | 'rel' | 'declaredSizes'>> = [];
    $('link[rel][href]').each((_, element) => {
      const rel = ($(element).attr('rel') ?? '').toLowerCase().split(/\s+/);
      const kind = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed') ? 'apple-touch-icon' : rel.includes('icon') ? 'icon' : null;
      const url = httpUrl($(element).attr('href'), pageUrl);
      if (kind !== null && url !== null) icons.push({ url, rel: kind, declaredSizes: str($(element).attr('sizes'), 40) });
    });
    const manifestUrl = httpUrl($('link[rel="manifest" i][href]').first().attr('href'), pageUrl);
    if (manifestUrl !== null) {
      try {
        const file = await this.fetcher.fetchBytes(parseTargetUrl(manifestUrl, this.config.ssrf), {
          maxBytes: MANIFEST_MAX_BYTES,
          accept: 'application/manifest+json,application/json;q=0.9,*/*;q=0.5',
        });
        const manifest: unknown = file.status === 200 && !file.truncated ? JSON.parse(file.body.toString('utf8')) : null;
        const list = (manifest as { icons?: unknown } | null)?.icons;
        for (const entry of Array.isArray(list) ? list.slice(0, 20) : []) {
          const url = httpUrl((entry as { src?: unknown } | null)?.src, file.finalUrl);
          if (url !== null) icons.push({ url, rel: 'manifest', declaredSizes: str((entry as { sizes?: unknown }).sizes, 40) });
        }
      } catch {
        // No readable manifest: the `<link>` icons and the default remain.
      }
    }
    // Declared large icons first, so the cap on candidates keeps the interesting ones.
    const declaredArea = (sizes: string | null): number => {
      const [w, h] = (sizes ?? '').toLowerCase().split(/\s+/)[0]?.split('x').map(Number) ?? [];
      return Number.isFinite(w) && Number.isFinite(h) ? (w ?? 0) * (h ?? 0) : 0;
    };
    return icons.sort((a, b) => declaredArea(b.declaredSizes) - declaredArea(a.declaredSizes));
  }

  /** Reads the header of one icon. `null` when it cannot be fetched or is not an image. */
  private async measureIcon(
    candidate: Pick<FaviconCandidate, 'url' | 'rel' | 'declaredSizes'>,
  ): Promise<FaviconCandidate | null> {
    try {
      const file = await this.fetcher.fetchBytes(parseTargetUrl(candidate.url, this.config.ssrf), {
        maxBytes: ICON_HEADER_BYTES,
        rangeBytes: ICON_HEADER_BYTES,
        accept: 'image/*,*/*;q=0.5',
      });
      if (file.status >= 400) return null;
      const header = readImageHeader(file.body);
      const isSvg = header === null && (file.contentType === 'image/svg+xml' || /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(file.body.subarray(0, 2048).toString('utf8')));
      if (header === null && !isSvg) return null;
      const total = Number(
        file.headers['content-range']?.split('/')[1] ?? (file.status === 200 ? file.headers['content-length'] : undefined) ?? NaN,
      );
      return {
        ...candidate,
        url: file.finalUrl,
        format: header?.format ?? 'svg',
        contentType: file.contentType,
        width: header?.width ?? null,
        height: header?.height ?? null,
        bytes: Number.isFinite(total) ? total : file.truncated ? null : file.body.byteLength,
      };
    } catch {
      return null;
    }
  }
}
