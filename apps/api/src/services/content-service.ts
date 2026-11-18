/**
 * Readable-content orchestration: cache → page markup → main-content extraction.
 */
import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import { assertCssSelector } from '../lib/selectors.js';
import type { TargetHeaders } from '../lib/target-headers.js';

import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import {
  extractContent,
  parseContentSelectors,
  type ContentOptions,
  type ReadableContent,
} from './content-extractor.js';
import type { PageLoader, RenderMode } from './page-loader.js';

export interface ContentRequest {
  readonly url: string;
  readonly render: RenderMode;
  /** Keep only the main content (default) or the whole body. */
  readonly mainContent: boolean;
  /** Comma-separated CSS selectors of the only elements to keep; `null` for none. */
  readonly include: string | null;
  /** Comma-separated CSS selectors of elements to drop; `null` for none. */
  readonly exclude: string | null;
  /** Reference-style links in the Markdown. */
  readonly citations: boolean;
  /** CSS selector to wait for (implies a browser render); `null` for none. */
  readonly waitForSelector: string | null;
  /** Caller-chosen request headers for the target; part of the cache key. */
  readonly headers?: TargetHeaders | null;
  /** Bypass the cache read (the fresh result is still written back). */
  readonly force: boolean;
  /** Cache lifetime for this request; `null` uses the configured default. */
  readonly ttlSeconds: number | null;
}

export interface ContentResult {
  readonly data: ReadableContent;
  readonly source: 'http' | 'browser';
  readonly cached: boolean;
  /** Lifetime applied to this answer (drives `Cache-Control`). */
  readonly ttlSeconds: number;
}

type CachedContent = Pick<ContentResult, 'data' | 'source'>;

/** Below this many words the static markup is assumed to miss the real content. */
const MIN_STATIC_WORDS = 50;
/** Version of the cached payload's shape; bump it whenever `ReadableContent` changes. */
const CACHE_SHAPE = 2;

/**
 * `waitForSelector` needs a browser: refused with `render=never` rather than
 * silently ignored.
 *
 * @throws {AppError} `EINVALIDPARAMS`.
 */
export function parseWaitForSelector(raw: string | null, render: RenderMode): string | null {
  if (raw === null) return null;
  if (render === 'never') {
    throw AppError.invalidParams('waitForSelector: requires a browser, remove `render=never`');
  }
  return assertCssSelector(raw, 'waitForSelector');
}

export class ContentService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly loader: PageLoader,
  ) {}

  /**
   * Returns the main content of a page as plain text and Markdown.
   *
   * @throws {AppError} `ENOTHTML` for a non-HTML target, plus the usual URL
   *   and network errors.
   */
  async getContent(request: ContentRequest): Promise<ContentResult> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const waitForSelector = parseWaitForSelector(request.waitForSelector, request.render);
    const options: ContentOptions = {
      mainContent: request.mainContent,
      include: parseContentSelectors(request.include, 'include'),
      exclude: parseContentSelectors(request.exclude, 'exclude'),
      citations: request.citations,
    };
    const headers = request.headers ?? null;
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.contentTtlSeconds;
    const key = cacheKey('content', {
      url: target.href,
      render: request.render,
      options,
      waitForSelector,
      shape: CACHE_SHAPE,
      ...(headers !== null && { headers }),
    });

    if (!request.force) {
      const hit = await getJson<CachedContent>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true, ttlSeconds };
    }

    const fresh = await this.flights.run(key, async () => {
      const result = await this.compute(target, request.render, options, waitForSelector, deadline, headers);
      await setJson(this.cache, key, result, ttlSeconds);
      return result;
    });
    return { ...fresh, cached: false, ttlSeconds };
  }

  private async compute(
    target: URL,
    render: RenderMode,
    options: ContentOptions,
    waitForSelector: string | null,
    deadline: Deadline,
    headers: TargetHeaders | null,
  ): Promise<CachedContent> {
    let staticContent: ReadableContent | null = null;
    const page = await this.loader.load(target, {
      render,
      deadline,
      waitForSelector,
      headers,
      isSufficient: (candidate) => {
        staticContent = extractContent(candidate.html, candidate.url, options);
        return staticContent.wordCount >= MIN_STATIC_WORDS;
      },
    });

    const data =
      page.source === 'http' && staticContent !== null
        ? staticContent
        : extractContent(page.html, page.url, options);
    return { data, source: page.source };
  }
}
