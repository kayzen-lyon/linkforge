/**
 * Loads the HTML of a page for the DOM-based endpoints (`/extract`,
 * `/content`): raw HTTP first, headless browser when that is not enough.
 *
 * Both paths are the SSRF-safe ones ({@link SafeFetcher}, {@link Renderer}).
 */
import { load } from 'cheerio';
import type { Page } from 'playwright-core';

import type { AppConfig } from '../config.js';
import { detectBlockPage } from '../lib/block-page.js';
import type { Deadline } from '../lib/deadline.js';
import { AppError, ErrorCode, findAppError } from '../lib/errors.js';
import type { TargetHeaders } from '../lib/target-headers.js';
import type { SafeFetcher } from './fetcher.js';
import type { Renderer, RenderOptions } from './renderer.js';

/**
 * - `auto`: raw HTTP first, browser only when the result is too poor (default).
 * - `never`: raw HTTP only (fastest, cheapest).
 * - `always`: always render in the browser (JavaScript-heavy sites).
 */
export type RenderMode = 'auto' | 'never' | 'always';

export interface LoadedPage {
  readonly html: string;
  /** Final URL of the document (after redirects). */
  readonly url: string;
  /** Which pipeline produced the markup. */
  readonly source: 'http' | 'browser';
}

export interface LoadOptions {
  readonly render: RenderMode;
  readonly deadline: Deadline;
  /** Caller's verdict on the static markup (`auto` only); defaults to "good enough". */
  readonly isSufficient?: (page: LoadedPage) => boolean;
  /** CSS selector to wait for; implies a browser render. */
  readonly waitForSelector?: string | null;
  /** Caller-chosen request headers, applied on both paths. */
  readonly headers?: TargetHeaders | null;
}

/** Statuses typically returned by anti-bot layers to non-browser clients. */
export const BOT_WALL_STATUSES: ReadonlySet<number> = new Set([401, 403, 406, 429, 503]);
/** Resources that are useless for DOM extraction and slow rendering down. */
export const HEAVY_RESOURCES = ['image', 'media', 'font'] as const;
export const HTML_TYPES: ReadonlySet<string> = new Set(['text/html', 'application/xhtml+xml']);

/** How the DOM-only endpoints render: no pixels needed, a short settle, little time kept for the job. */
export function domRenderOptions(
  deadline: Deadline,
  waitForSelector: string | null = null,
  requestHeaders: TargetHeaders | null = null,
): RenderOptions {
  return {
    waitUntil: 'domcontentloaded',
    settleMs: 4000,
    reserveMs: 3000,
    deadline,
    waitForSelector,
    requestHeaders,
    guard: { blockResourceTypes: HEAVY_RESOURCES },
    contextOptions: { viewport: { width: 1280, height: 800 } },
  };
}

/**
 * Serialised DOM of a rendered page, capped like a raw HTTP body: a page must
 * not be able to grow the document without bound.
 */
export async function snapshotHtml(page: Page, maxBytes: number): Promise<string> {
  return (await page.content()).slice(0, maxBytes);
}

/**
 * `type` values of a `<script>` that browsers run. Any other value makes the
 * element a data block (`application/ld+json`, `application/json`,
 * `text/template`, `importmap`, `speculationrules`…), which changes nothing in
 * the DOM.
 */
const EXECUTABLE_SCRIPT_TYPE =
  /^(?:module|(?:text|application)\/(?:x-)?(?:java|ecma)script|text\/(?:javascript1\.[0-5]|jscript|livescript))$/;

/**
 * Tells whether the markup holds a script a browser would run, i.e. whether
 * rendering could produce a DOM different from the static one.
 *
 * Data blocks do not count: a static page whose only `<script>` is its JSON-LD
 * is complete as fetched, and sending it to the browser costs seconds and a
 * rendering slot for the very same markup.
 */
export function hasExecutableScript(html: string): boolean {
  // Cheap way out for script-less documents: no parse.
  if (!/<script\b/i.test(html)) return false;
  return load(html)('script')
    .toArray()
    .some((element) => {
      // MIME parameters are dropped: when in doubt, the script counts as executable.
      const type = (element.attribs['type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      return type === '' || EXECUTABLE_SCRIPT_TYPE.test(type);
    });
}

/** A document with scripts but almost no text: content is rendered client-side. */
export function looksLikeEmptyShell(html: string): boolean {
  const $ = load(html);
  $('script, style, noscript, template').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().length < 200;
}

export class PageLoader {
  constructor(
    private readonly config: AppConfig,
    private readonly fetcher: SafeFetcher,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Returns the markup of `target`.
   *
   * `never`: raw HTTP only. `always`: browser only. `auto`: raw HTTP, then the
   * browser when the answer is a block page, or when the page runs scripts
   * (data blocks such as JSON-LD are not scripts) and either looks like an empty shell or is judged insufficient by the caller.
   *
   * @throws {AppError} `ENOTHTML` when the target is not an HTML document,
   *   `EBLOCKED` when it only serves a block page, plus the usual network
   *   errors (`EFORBIDDENURL`, `ETIMEOUT`, `EUNREACHABLE`, `ETARGETSTATUS`, `EBUSY`).
   */
  async load(target: URL, options: LoadOptions): Promise<LoadedPage> {
    const { deadline } = options;
    const waitForSelector = options.waitForSelector ?? null;
    const headers = options.headers ?? null;
    const render = waitForSelector === null ? options.render : 'always';
    if (render === 'always') return this.viaBrowser(target, deadline, waitForSelector, headers);

    const doc = await this.fetcher.fetchDocument(target, headers);
    if (doc.status >= 400) {
      if (render === 'auto' && BOT_WALL_STATUSES.has(doc.status)) {
        return this.viaBrowser(target, deadline, null, headers);
      }
      throw AppError.targetStatus(doc.status);
    }
    if (doc.html === null) throw AppError.notHtml(doc.contentType);

    const page: LoadedPage = { html: doc.html, url: doc.finalUrl, source: 'http' };
    const verdict = detectBlockPage(page.html);
    if (verdict.blocked) {
      if (render === 'never') throw AppError.blocked(verdict.reason ?? 'block page');
      // A real browser passes many challenges; if it does not, it reports EBLOCKED itself.
      return this.viaBrowser(target, deadline, null, headers);
    }
    if (render === 'never') return page;
    // Without a script to run, a browser would produce exactly the same DOM.
    if (!hasExecutableScript(page.html)) return page;
    if (!looksLikeEmptyShell(page.html) && (options.isSufficient?.(page) ?? true)) return page;

    try {
      return await this.viaBrowser(target, deadline, null, headers);
    } catch (error) {
      // A forbidden destination found while rendering is a verdict, not a glitch.
      if (findAppError(error)?.code === ErrorCode.ForbiddenUrl) throw error;
      // The static pass produced *something*: a degraded answer beats an error.
      return page;
    }
  }

  private viaBrowser(
    target: URL,
    deadline: Deadline,
    waitForSelector: string | null,
    headers: TargetHeaders | null,
  ): Promise<LoadedPage> {
    return this.renderer.render(
      target,
      domRenderOptions(deadline, waitForSelector, headers),
      async ({ page, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) {
          if (BOT_WALL_STATUSES.has(status)) {
            const challenge = detectBlockPage(await snapshotHtml(page, this.config.http.maxBodyBytes));
            if (challenge.blocked) throw AppError.blocked(challenge.reason ?? 'block page');
          }
          throw AppError.targetStatus(status);
        }

        const contentType =
          response?.headers()['content-type']?.split(';')[0]?.trim().toLowerCase() ?? null;
        // Chromium wraps images, JSON and text in a synthetic HTML viewer.
        if (contentType !== null && !HTML_TYPES.has(contentType)) {
          throw AppError.notHtml(contentType);
        }

        const html = await snapshotHtml(page, this.config.http.maxBodyBytes);
        const verdict = detectBlockPage(html);
        if (verdict.blocked) throw AppError.blocked(verdict.reason ?? 'block page');
        return { html, url: page.url(), source: 'browser' as const };
      },
    );
  }
}
