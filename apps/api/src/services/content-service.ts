/**
 * Readable-content orchestration: cache → page markup → main-content extraction.
 */
import type { AppConfig } from '../config.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import { extractContent, type ReadableContent } from './content-extractor.js';
import type { RenderMode } from './meta-service.js';
import type { PageLoader } from './page-loader.js';

export interface ContentRequest {
  readonly url: string;
  readonly render: RenderMode;
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
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.contentTtlSeconds;
    const key = cacheKey('content', { url: target.href, render: request.render });

    if (!request.force) {
      const hit = await getJson<CachedContent>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true, ttlSeconds };
    }

    const fresh = await this.flights.run(key, async () => {
      const result = await this.compute(target, request.render);
      await setJson(this.cache, key, result, ttlSeconds);
      return result;
    });
    return { ...fresh, cached: false, ttlSeconds };
  }

  private async compute(target: URL, render: RenderMode): Promise<CachedContent> {
    let staticContent: ReadableContent | null = null;
    const page = await this.loader.load(target, render, (candidate) => {
      staticContent = extractContent(candidate.html, candidate.url);
      return staticContent.wordCount >= MIN_STATIC_WORDS;
    });

    const data =
      page.source === 'http' && staticContent !== null
        ? staticContent
        : extractContent(page.html, page.url);
    return { data, source: page.source };
  }
}
