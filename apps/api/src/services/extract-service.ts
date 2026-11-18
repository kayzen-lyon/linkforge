/**
 * Custom extraction orchestration: cache → page markup → client rules.
 */
import type { AppConfig } from '../config.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import {
  extractFields,
  hasEmptyField,
  parseFieldRules,
  type FieldRules,
  type FieldValue,
} from './field-extractor.js';
import type { RenderMode } from './meta-service.js';
import type { PageLoader } from './page-loader.js';

export interface ExtractRequest {
  readonly url: string;
  readonly render: RenderMode;
  /** JSON-encoded rules, exactly as received from the client. */
  readonly fields: string;
  /** Bypass the cache read (the fresh result is still written back). */
  readonly force: boolean;
  /** Cache lifetime for this request; `null` uses the configured default. */
  readonly ttlSeconds: number | null;
}

export interface ExtractResult {
  readonly data: {
    /** Final URL of the document (after redirects). */
    readonly url: string;
    readonly fields: Readonly<Record<string, FieldValue>>;
  };
  readonly source: 'http' | 'browser';
  readonly cached: boolean;
  /** Lifetime applied to this answer (drives `Cache-Control`). */
  readonly ttlSeconds: number;
}

type CachedExtract = Pick<ExtractResult, 'data' | 'source'>;

export class ExtractService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly loader: PageLoader,
  ) {}

  /**
   * Extracts client-defined fields from a page.
   *
   * @throws {AppError} `EINVALIDPARAMS` for invalid rules, `ENOTHTML` for a
   *   non-HTML target, plus the usual URL and network errors.
   */
  async extract(request: ExtractRequest): Promise<ExtractResult> {
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const rules = parseFieldRules(request.fields);
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.extractTtlSeconds;
    // Keyed on the parsed rules, so formatting differences in the JSON still hit.
    const key = cacheKey('extract', { url: target.href, render: request.render, rules });

    if (!request.force) {
      const hit = await getJson<CachedExtract>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true, ttlSeconds };
    }

    const fresh = await this.flights.run(key, async () => {
      const result = await this.compute(target, request.render, rules);
      await setJson(this.cache, key, result, ttlSeconds);
      return result;
    });
    return { ...fresh, cached: false, ttlSeconds };
  }

  private async compute(target: URL, render: RenderMode, rules: FieldRules): Promise<CachedExtract> {
    let staticFields: Record<string, FieldValue> | null = null;
    // In `auto` mode a field left empty by the static markup is a hint that the
    // value is injected client-side: that is what triggers the browser.
    const page = await this.loader.load(target, render, (candidate) => {
      staticFields = extractFields(candidate.html, candidate.url, rules);
      return !hasEmptyField(staticFields);
    });

    const fields =
      page.source === 'http' && staticFields !== null
        ? staticFields
        : extractFields(page.html, page.url, rules);
    return { data: { url: page.url, fields }, source: page.source };
  }
}
