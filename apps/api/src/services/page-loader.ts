/**
 * Loads the HTML of a page for the DOM-based endpoints (`/extract`,
 * `/content`): raw HTTP first, headless browser when that is not enough.
 *
 * Both paths are the SSRF-safe ones ({@link SafeFetcher}, {@link Renderer}).
 */
import { load } from 'cheerio';

import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import type { SafeFetcher } from './fetcher.js';
import type { RenderMode } from './meta-service.js';
import type { Renderer } from './renderer.js';

export interface LoadedPage {
  readonly html: string;
  /** Final URL of the document (after redirects). */
  readonly url: string;
  /** Which pipeline produced the markup. */
  readonly source: 'http' | 'browser';
}

/** Statuses typically returned by anti-bot layers to non-browser clients. */
const BOT_WALL_STATUSES = new Set([401, 403, 406, 429, 503]);
/** Resources that are useless for DOM extraction and slow rendering down. */
const HEAVY_RESOURCES = ['image', 'media', 'font'] as const;
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);

/** A document with scripts but almost no text: content is rendered client-side. */
function looksLikeEmptyShell(html: string): boolean {
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
   * @param render - `never`: raw HTTP only. `always`: browser only. `auto`:
   *   raw HTTP, then the browser when the page runs scripts and either looks
   *   like an empty shell or is judged insufficient by the caller.
   * @param isSufficient - Caller's verdict on the static markup (`auto` only).
   * @throws {AppError} `ENOTHTML` when the target is not an HTML document, plus
   *   the usual network errors (`EFORBIDDENURL`, `ETIMEOUT`, `EUNREACHABLE`,
   *   `ETARGETSTATUS`, `EBUSY`).
   */
  async load(
    target: URL,
    render: RenderMode,
    isSufficient: (page: LoadedPage) => boolean = () => true,
  ): Promise<LoadedPage> {
    if (render === 'always') return this.viaBrowser(target);

    const doc = await this.fetcher.fetchDocument(target);
    if (doc.status >= 400) {
      if (render === 'auto' && BOT_WALL_STATUSES.has(doc.status)) return this.viaBrowser(target);
      throw AppError.targetStatus(doc.status);
    }
    if (doc.html === null) throw AppError.notHtml(doc.contentType);

    const page: LoadedPage = { html: doc.html, url: doc.finalUrl, source: 'http' };
    if (render === 'never') return page;
    // Without a script, a browser would produce exactly the same DOM.
    if (!/<script\b/i.test(page.html)) return page;
    if (!looksLikeEmptyShell(page.html) && isSufficient(page)) return page;

    try {
      return await this.viaBrowser(target);
    } catch {
      // The static pass produced *something*: a degraded answer beats an error.
      return page;
    }
  }

  private viaBrowser(target: URL): Promise<LoadedPage> {
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

        const contentType =
          response?.headers()['content-type']?.split(';')[0]?.trim().toLowerCase() ?? null;
        // Chromium wraps images, JSON and text in a synthetic HTML viewer.
        if (contentType !== null && !HTML_TYPES.has(contentType)) {
          throw AppError.notHtml(contentType);
        }

        // Same cap as the raw fetcher: a page must not grow the DOM without bound.
        const html = (await page.content()).slice(0, this.config.http.maxBodyBytes);
        return { html, url: page.url(), source: 'browser' as const };
      },
    );
  }
}
