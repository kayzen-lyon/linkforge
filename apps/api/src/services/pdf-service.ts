/**
 * PDF orchestration: cache → headless browser print.
 */
import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import { escapeHtml } from '../lib/html-escape.js';
import { assertCssSelector } from '../lib/selectors.js';
import type { TargetHeaders } from '../lib/target-headers.js';

import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, SingleFlight, type Cache } from './cache/index.js';
import {
  CONSENT_BANNER_SELECTORS,
  hideElements,
  IMAGE_SETTLE_BUDGET_MS,
  SCROLL_PASS_BUDGET_MS,
  scrollThrough,
  waitForFonts,
  waitForImages,
} from './page-prep.js';
import type { Renderer } from './renderer.js';

export type PdfFormat = 'A4' | 'Letter';

export interface PdfRequest {
  readonly url: string;
  readonly format: PdfFormat;
  readonly landscape: boolean;
  /** Print CSS backgrounds (Chromium drops them by default, like a real printer). */
  readonly printBackground: boolean;
  /** Hide common cookie / consent banners before printing. */
  readonly hideBanners: boolean;
  /** Drop requests to well-known advertising and tracking hosts. */
  readonly blockAds: boolean;
  /** CSS selector that must be in the DOM before printing; `null` for none. */
  readonly waitForSelector: string | null;
  /** Page margin on every side, in millimetres; `null` keeps the page's own (`@page`) margins. */
  readonly marginMm?: number | null;
  /** Scale of the rendering (0.1–2). */
  readonly scale?: number;
  /** Pages to keep, e.g. `1-3,5`; `null` for all (up to the page cap). */
  readonly pageRanges?: string | null;
  /** Text printed at the top / bottom of every page; `{page}`, `{pages}`, `{title}`, `{url}`, `{date}` are filled in. */
  readonly headerText?: string | null;
  readonly footerText?: string | null;
  /** Caller-chosen request headers for the target; part of the cache key. */
  readonly headers?: TargetHeaders | null;
  readonly force: boolean;
  /** Cache lifetime for this request; `null` uses the configured default. */
  readonly ttlSeconds: number | null;
}

export interface PdfResult {
  readonly pdf: Buffer;
  readonly cached: boolean;
  /** Lifetime applied to this answer (drives `Cache-Control`). */
  readonly ttlSeconds: number;
}

/**
 * Pages printed at most. Bounds Chromium's work and memory on endless pages;
 * the byte limit (`PDF_MAX_BYTES`) then bounds what is returned and cached.
 */
const MAX_PAGES = 100;
/** Distance scrolled to trigger lazy content before printing. */
const MAX_SCROLL_HEIGHT = 30_000;
/** Time kept for the print itself. */
const PRINT_RESERVE_MS = 10_000;
/** Smallest top / bottom margin that leaves room for a header or footer line. */
const HEADER_FOOTER_MIN_MARGIN_MM = 12;

/** Chromium fills elements carrying these classes in a header or footer template. */
const TEMPLATE_TOKENS: Readonly<Record<string, string>> = {
  '{page}': '<span class="pageNumber"></span>',
  '{pages}': '<span class="totalPages"></span>',
  '{title}': '<span class="title"></span>',
  '{url}': '<span class="url"></span>',
  '{date}': '<span class="date"></span>',
};

/**
 * Builds a header or footer template from plain text. The text is escaped
 * first; only then are the five known tokens replaced by fixed markup, so a
 * client can never contribute a tag.
 */
export function headerFooterTemplate(text: string | null): string {
  if (text === null) return '<span></span>';
  const safe = escapeHtml(text).replace(/\{(?:page|pages|title|url|date)\}/g, (token) => TEMPLATE_TOKENS[token] ?? token);
  return `<div style="width:100%;font-size:8px;font-family:system-ui,sans-serif;color:#555;text-align:center;padding:0 10mm;">${safe}</div>`;
}

/**
 * Validates `pageRanges` (`2`, `1-3`, `1-3,5,8-10`) against the page cap.
 *
 * @throws {AppError} `EINVALIDPARAMS`.
 */
export function parsePageRanges(raw: string | null): string | null {
  if (raw === null) return null;
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.length > 10 || !parts.every((part) => /^\d{1,3}(?:-\d{1,3})?$/.test(part))) {
    throw AppError.invalidParams('pageRanges: expected ranges such as `1-3,5` (at most 10)');
  }
  for (const part of parts) {
    const [from = 0, to = from] = part.split('-').map(Number);
    if (from < 1 || to < from || to > MAX_PAGES) {
      throw AppError.invalidParams(`pageRanges: pages go from 1 to ${MAX_PAGES}, in increasing order`);
    }
  }
  return parts.join(',');
}

export class PdfService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Prints a web page to PDF.
   *
   * @throws {AppError} `ETOOLARGE` when the document exceeds the size limit,
   *   plus the usual URL, network and browser errors.
   */
  async print(request: PdfRequest): Promise<PdfResult> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const waitForSelector =
      request.waitForSelector === null
        ? null
        : assertCssSelector(request.waitForSelector, 'waitForSelector');
    const pageRanges = parsePageRanges(request.pageRanges ?? null);
    const layout = {
      marginMm: request.marginMm ?? null,
      scale: request.scale ?? 1,
      pageRanges,
      headerText: request.headerText ?? null,
      footerText: request.footerText ?? null,
    };
    const customLayout = Object.entries(layout).some(([name, value]) => (name === 'scale' ? value !== 1 : value !== null));
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.pdfTtlSeconds;
    const key = cacheKey('pdf', {
      ...(customLayout && { layout }),
      url: target.href,
      format: request.format,
      landscape: request.landscape,
      printBackground: request.printBackground,
      hideBanners: request.hideBanners,
      blockAds: request.blockAds,
      waitForSelector,
      ...(request.headers != null && { headers: request.headers }),
    });

    if (!request.force) {
      const hit = await this.cache.get(key);
      if (hit !== null) return { pdf: hit, cached: true, ttlSeconds };
    }

    const pdf = await this.flights.run(key, async () => {
      const fresh = await this.render(target, { ...request, ...layout, waitForSelector }, deadline);
      await this.cache.set(key, fresh, ttlSeconds);
      return fresh;
    });
    return { pdf, cached: false, ttlSeconds };
  }

  private render(target: URL, request: PdfRequest, deadline: Deadline): Promise<Buffer> {
    const { maxBytes } = this.config.pdf;
    return this.renderer.render(
      target,
      {
        waitUntil: 'load',
        settleMs: 3000,
        deadline,
        reserveMs: PRINT_RESERVE_MS + SCROLL_PASS_BUDGET_MS + IMAGE_SETTLE_BUDGET_MS,
        waitForSelector: request.waitForSelector,
        requestHeaders: request.headers ?? null,
        guard: { blockAds: request.blockAds },
        contextOptions: { viewport: { width: 1280, height: 800 } },
      },
      async ({ page, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);

        await waitForFonts(page, 2000);
        if (request.hideBanners) await hideElements(page, CONSENT_BANNER_SELECTORS);
        // A printed page has no viewport: everything lazy must be loaded first.
        await scrollThrough(
          page,
          MAX_SCROLL_HEIGHT,
          deadline.budget(SCROLL_PASS_BUDGET_MS, PRINT_RESERVE_MS + IMAGE_SETTLE_BUDGET_MS),
        );
        await waitForImages(
          page,
          MAX_SCROLL_HEIGHT,
          deadline.budget(IMAGE_SETTLE_BUDGET_MS, PRINT_RESERVE_MS),
        );

        const decorated = request.headerText != null || request.footerText != null;
        const margin = request.marginMm ?? null;
        // A header or footer is printed inside the margin: it needs one.
        const vertical = decorated ? Math.max(margin ?? 0, HEADER_FOOTER_MIN_MARGIN_MM) : margin;
        const pdf = await page.pdf({
          format: request.format,
          landscape: request.landscape,
          printBackground: request.printBackground,
          scale: request.scale ?? 1,
          pageRanges: request.pageRanges ?? `1-${MAX_PAGES}`,
          ...(vertical !== null && {
            margin: {
              top: `${request.headerText != null || !decorated ? vertical : (margin ?? 0)}mm`,
              bottom: `${request.footerText != null || !decorated ? vertical : (margin ?? 0)}mm`,
              left: `${margin ?? 10}mm`,
              right: `${margin ?? 10}mm`,
            },
          }),
          ...(decorated && {
            displayHeaderFooter: true,
            headerTemplate: headerFooterTemplate(request.headerText ?? null),
            footerTemplate: headerFooterTemplate(request.footerText ?? null),
          }),
        });
        if (pdf.byteLength > maxBytes) {
          throw AppError.tooLarge(
            `The PDF is ${pdf.byteLength} bytes, above the ${maxBytes}-byte limit`,
          );
        }
        return pdf;
      },
    );
  }
}
