/**
 * Site-inspection endpoints that only need the raw HTTP path: links of a
 * page, link checker, sitemap reader and technology detection.
 */
import { gunzipSync } from 'node:zlib';

import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import { readImageHeader } from '../lib/image-header.js';
import { assertCssSelector } from '../lib/selectors.js';
import type { TargetHeaders } from '../lib/target-headers.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import type { ProbeResult, SafeFetcher } from './fetcher.js';
import { extractMetadata } from './meta-extractor.js';
import { extractLinks, type LinkScope, type PageLinks } from './link-extractor.js';
import { HTML_TYPES, type PageLoader, type RenderMode } from './page-loader.js';
import { parseRobotsSitemaps, parseSitemap, type SitemapUrl } from './sitemap-parser.js';

interface Cacheable {
  /** Caller-chosen request headers for the target; part of the cache key. */
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

export interface LinksData extends PageLinks {
  /** Final URL of the document (after redirects). */
  readonly url: string;
}

export interface CheckData {
  /** URL as submitted (normalised). */
  readonly url: string;
  readonly finalUrl: string;
  /** True when the final status is below 400. */
  readonly ok: boolean;
  readonly status: number;
  readonly redirects: ProbeResult['hops'];
  readonly contentType: string | null;
  readonly contentLength: number | null;
  readonly tls: ProbeResult['certificate'];
  readonly durationMs: number;
}

export interface SitemapFile {
  readonly url: string;
  readonly kind: 'index' | 'urlset' | 'unknown';
  /** `<url>` entries of this file (0 for an index). */
  readonly urlCount: number;
  /** `null` when the file was read; otherwise why it was not. */
  readonly error: string | null;
}

export interface SitemapData {
  readonly robotsUrl: string;
  /** True when robots.txt exists (HTTP 200). */
  readonly robotsFound: boolean;
  /** Files read, in the order they were discovered. */
  readonly sitemaps: readonly SitemapFile[];
  /** URLs counted across every file read. */
  readonly urlCount: number;
  readonly urls: readonly SitemapUrl[];
  /** True when a cap (files, bytes, URLs or time) cut the result short. */
  readonly truncated: boolean;
}

export interface ImageData {
  /** URL of the image that was measured (after redirects). */
  readonly url: string;
  /** The page it was found on, when `url` was a page rather than an image. */
  readonly pageUrl: string | null;
  /** `png`, `jpeg`, `gif`, `webp`; `null` when the header was not recognised. */
  readonly format: string | null;
  readonly contentType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  /** Size of the file as announced by the server; `null` when it does not say. */
  readonly bytes: number | null;
}

export interface HtmlData {
  readonly url: string;
  readonly html: string;
}

/** Bytes of an image downloaded to read its header (a JPEG may carry large EXIF first). */
const IMAGE_HEADER_BYTES = 128 * 1024;

/** Sitemap files read per request, index files included. */
export const SITEMAP_MAX_FILES = 10;
/** Size of one decompressed sitemap file. */
const SITEMAP_MAX_BYTES = 10 * 1024 * 1024;
const ROBOTS_MAX_BYTES = 512 * 1024;

export class SiteToolsService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly fetcher: SafeFetcher,
    private readonly loader: PageLoader,
  ) {}

  /** Cache read → single-flight computation → cache write. */
  private async cached<T>(
    namespace: string,
    parts: Readonly<Record<string, unknown>>,
    request: Cacheable,
    defaultTtl: number,
    compute: () => Promise<Pick<Answer<T>, 'data' | 'source'>>,
  ): Promise<Answer<T>> {
    const ttlSeconds = request.ttlSeconds ?? defaultTtl;
    const key = cacheKey(namespace, {
      ...parts,
      ...(request.headers != null && { headers: request.headers }),
    });
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
   * Links of a page.
   *
   * @throws {AppError} `ENOTHTML`, `EBLOCKED`, plus the usual URL and network errors.
   */
  links(
    request: Cacheable & { url: string; render: RenderMode; scope: LinkScope; limit: number },
  ): Promise<Answer<LinksData>> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const { render, scope, limit } = request;
    return this.cached(
      'links',
      { url: target.href, render, scope, limit },
      request,
      this.config.cache.contentTtlSeconds,
      async () => {
        // `auto` only reaches for the browser when the static page has no link at all.
        const page = await this.loader.load(target, {
          render,
          deadline,
          headers: request.headers ?? null,
          isSufficient: (candidate) => extractLinks(candidate.html, candidate.url, 'all', 1).total > 0,
        });
        return {
          data: { url: page.url, ...extractLinks(page.html, page.url, scope, limit) },
          source: page.source,
        };
      },
    );
  }

  /**
   * Checks a link: status, redirect chain, timings, certificate. Never cached:
   * the point of a check is the state right now.
   *
   * @throws {AppError} Invalid/forbidden URL, timeout, unreachable target.
   */
  async check(url: string): Promise<CheckData> {
    const target = parseTargetUrl(url, this.config.ssrf);
    const startedAt = performance.now();
    const probe = await this.fetcher.probe(target);
    return {
      url: target.href,
      finalUrl: probe.finalUrl,
      ok: probe.status < 400,
      status: probe.status,
      redirects: probe.hops,
      contentType: probe.contentType,
      contentLength: probe.contentLength,
      tls: probe.certificate,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  /**
   * Reads a site's robots.txt and sitemaps. Index files are followed one level.
   *
   * @param request.url - Any URL of the site, or the URL of a sitemap file.
   * @throws {AppError} Invalid/forbidden URL. Unreadable files are reported per file.
   */
  sitemap(request: Cacheable & { url: string; limit: number }): Promise<Answer<SitemapData>> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const { limit } = request;
    return this.cached(
      'sitemap',
      { url: target.href, limit },
      request,
      this.config.cache.metaTtlSeconds,
      async () => ({ data: await this.readSitemaps(target, limit, deadline), source: 'http' }),
    );
  }

  private async readSitemaps(target: URL, limit: number, deadline: Deadline): Promise<SitemapData> {
    const robotsUrl = new URL('/robots.txt', target);
    const robots = await this.fetcher
      .fetchBytes(robotsUrl, { maxBytes: ROBOTS_MAX_BYTES, accept: 'text/plain,*/*;q=0.5' })
      .catch((error: unknown) => {
        // A forbidden site is an error; a site without robots.txt is not.
        if (error instanceof AppError && error.statusCode === 403) throw error;
        return null;
      });
    const robotsFound = robots !== null && robots.status === 200 && !HTML_TYPES.has(robots.contentType ?? '');

    const isSitemapUrl = /sitemap|\.xml(?:\.gz)?$/i.test(target.pathname);
    const declared = robotsFound
      ? parseRobotsSitemaps(robots.body.toString('utf8'), robotsUrl.href, SITEMAP_MAX_FILES)
      : [];
    const roots = isSitemapUrl
      ? [target.href]
      : declared.length > 0
        ? declared
        : [new URL('/sitemap.xml', target).href];

    const files: SitemapFile[] = [];
    const urls: SitemapUrl[] = [];
    const seen = new Set<string>();
    let urlCount = 0;
    let truncated = false;

    // Two rounds at most: the roots, then the children of index files.
    let round = roots;
    for (let level = 0; level < 2 && round.length > 0; level += 1) {
      const batch = [...new Set(round)].filter((url) => !seen.has(url));
      const allowed = batch.slice(0, SITEMAP_MAX_FILES - seen.size);
      if (allowed.length < batch.length) truncated = true;
      // Not enough time left for another round of fetches: stop with what we have.
      if (deadline.remaining() < this.config.http.timeoutMs + 2000) {
        truncated = truncated || allowed.length > 0;
        break;
      }
      for (const url of allowed) seen.add(url);

      const next: string[] = [];
      const results = await Promise.all(allowed.map((url) => this.readSitemapFile(url, limit)));
      results.forEach((result, index) => {
        const url = allowed[index] ?? '';
        if ('error' in result) {
          files.push({ url, kind: 'unknown', urlCount: 0, error: result.error });
          return;
        }
        files.push({ url, kind: result.parsed.kind, urlCount: result.parsed.urlCount, error: null });
        truncated = truncated || result.truncated;
        urlCount += result.parsed.urlCount;
        urls.push(...result.parsed.urls.slice(0, Math.max(0, limit - urls.length)));
        next.push(...result.parsed.sitemaps);
      });
      // An index nested in an index is not followed.
      if (level === 1 && next.length > 0) truncated = true;
      round = next;
    }

    return {
      robotsUrl: robotsUrl.href,
      robotsFound,
      sitemaps: files,
      urlCount,
      urls,
      truncated: truncated || urlCount > urls.length,
    };
  }

  private async readSitemapFile(
    url: string,
    limit: number,
  ): Promise<{ parsed: ReturnType<typeof parseSitemap>; truncated: boolean } | { error: string }> {
    try {
      // Validated like any target: a sitemap may point anywhere.
      const target = parseTargetUrl(url, this.config.ssrf);
      const file = await this.fetcher.fetchBytes(target, {
        maxBytes: this.config.http.maxBodyBytes,
        accept: 'application/xml,text/xml,application/gzip,*/*;q=0.5',
      });
      if (file.status >= 400) return { error: `HTTP ${file.status}` };
      let body = file.body;
      let truncated = file.truncated;
      // `.xml.gz` served as a file (not as a content encoding) starts with the gzip magic.
      if (body[0] === 0x1f && body[1] === 0x8b) {
        if (truncated) return { error: 'compressed file larger than the size limit' };
        try {
          body = gunzipSync(body, { maxOutputLength: SITEMAP_MAX_BYTES });
        } catch {
          return { error: 'invalid gzip data or decompressed size over the limit' };
        }
      }
      const parsed = parseSitemap(body.toString('utf8'), limit);
      if (parsed.kind === 'unknown') return { error: 'not a sitemap document' };
      truncated = truncated || parsed.urlCount > parsed.urls.length;
      return { parsed, truncated };
    } catch (error) {
      return { error: error instanceof AppError ? error.code : 'EINTERNAL' };
    }
  }

  /**
   * Format, pixel dimensions and byte size of an image, read from the start of
   * the file only. Given a page, measures its main preview image.
   *
   * @throws {AppError} `ETARGETSTATUS`, `EEMBEDNOTFOUND` when a page declares no image,
   *   plus the usual URL and network errors.
   */
  image(request: Cacheable & { url: string }): Promise<Answer<ImageData>> {
    const target = parseTargetUrl(request.url, this.config.ssrf);
    return this.cached(
      'image',
      { url: target.href },
      request,
      this.config.cache.metaTtlSeconds,
      async () => {
        const read = (url: URL) =>
          this.fetcher.fetchBytes(url, {
            maxBytes: IMAGE_HEADER_BYTES,
            rangeBytes: IMAGE_HEADER_BYTES,
            accept: 'image/*,text/html;q=0.8,*/*;q=0.5',
          });
        let file = await read(target);
        if (file.status >= 400) throw AppError.targetStatus(file.status);
        let pageUrl: string | null = null;
        if (HTML_TYPES.has(file.contentType ?? '')) {
          pageUrl = file.finalUrl;
          const main = extractMetadata(file.body.toString('utf8'), file.finalUrl).image;
          if (main === null) throw AppError.embedNotFound('The page declares no preview image');
          // The image URL comes from the page: validated like any target.
          file = await read(parseTargetUrl(main.url, this.config.ssrf));
          if (file.status >= 400) throw AppError.targetStatus(file.status);
        }
        const header = readImageHeader(file.body);
        // `Content-Range: bytes 0-131071/734003` on a partial answer, else `Content-Length`.
        const total = Number(
          file.headers['content-range']?.split('/')[1] ??
            (file.status === 200 ? file.headers['content-length'] : undefined) ??
            NaN,
        );
        return {
          data: {
            url: file.finalUrl,
            pageUrl,
            format: header?.format ?? null,
            contentType: file.contentType,
            width: header?.width ?? null,
            height: header?.height ?? null,
            bytes: Number.isFinite(total) ? total : file.truncated ? null : file.body.byteLength,
          },
          source: 'http',
        };
      },
    );
  }

  /**
   * The HTML of a page, rendered by default (what the DOM looks like once
   * scripts have run). Capped like a raw HTTP body.
   *
   * @throws {AppError} `ENOTHTML`, `EBLOCKED`, plus the usual URL, network and browser errors.
   */
  html(
    request: Cacheable & { url: string; render: RenderMode; waitForSelector: string | null },
  ): Promise<Answer<HtmlData>> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const { render } = request;
    if (request.waitForSelector !== null && render === 'never') {
      throw AppError.invalidParams('waitForSelector: requires a browser, remove `render=never`');
    }
    const waitForSelector =
      request.waitForSelector === null
        ? null
        : assertCssSelector(request.waitForSelector, 'waitForSelector');
    return this.cached(
      'html',
      { url: target.href, render, waitForSelector },
      request,
      this.config.cache.contentTtlSeconds,
      async () => {
        const page = await this.loader.load(target, {
          render,
          deadline,
          waitForSelector,
          headers: request.headers ?? null,
        });
        return { data: { url: page.url, html: page.html }, source: page.source };
      },
    );
  }
}
