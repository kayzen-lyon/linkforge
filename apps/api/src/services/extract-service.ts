/**
 * Custom extraction orchestration: cache → page markup → client rules.
 */
import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import type { TargetHeaders } from '../lib/target-headers.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import {
  extractFields,
  hasEmptyField,
  parseFieldRules,
  type FieldRules,
  type FieldValue,
} from './field-extractor.js';
import { parseWaitForSelector } from './content-service.js';
import type { PageLoader, RenderMode } from './page-loader.js';

export interface ExtractRequest {
  readonly url: string;
  readonly render: RenderMode;
  /** JSON-encoded rules, exactly as received from the client. */
  readonly fields: string;
  /** CSS selector to wait for (implies a browser render); `null` for none. */
  readonly waitForSelector: string | null;
  /** Caller-chosen request headers for the target; part of the cache key. */
  readonly headers?: TargetHeaders | null;
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
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const rules = parseFieldRules(request.fields);
    const waitForSelector = parseWaitForSelector(request.waitForSelector, request.render);
    const headers = request.headers ?? null;
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.extractTtlSeconds;
    // Keyed on the parsed rules, so formatting differences in the JSON still hit.
    const key = cacheKey('extract', {
      url: target.href,
      render: request.render,
      rules,
      waitForSelector,
      ...(headers !== null && { headers }),
    });

    if (!request.force) {
      const hit = await getJson<CachedExtract>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true, ttlSeconds };
    }

    const fresh = await this.flights.run(key, async () => {
      const result = await this.compute(target, request.render, rules, waitForSelector, deadline, headers);
      await setJson(this.cache, key, result, ttlSeconds);
      return result;
    });
    return { ...fresh, cached: false, ttlSeconds };
  }

  private async compute(
    target: URL,
    render: RenderMode,
    rules: FieldRules,
    waitForSelector: string | null,
    deadline: Deadline,
    headers: TargetHeaders | null,
  ): Promise<CachedExtract> {
    let staticFields: Record<string, FieldValue> | null = null;
    // In `auto` mode a field left empty by the static markup is a hint that the
    // value is injected client-side: that is what triggers the browser.
    const page = await this.loader.load(target, {
      render,
      deadline,
      waitForSelector,
      headers,
      isSufficient: (candidate) => {
        staticFields = extractFields(candidate.html, candidate.url, rules);
        return !hasEmptyField(staticFields);
      },
    });

    const fields =
      page.source === 'http' && staticFields !== null
        ? staticFields
        : extractFields(page.html, page.url, rules);
    return { data: { url: page.url, fields }, source: page.source };
  }
}
