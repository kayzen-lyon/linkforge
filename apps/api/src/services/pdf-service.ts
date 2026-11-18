/**
 * PDF orchestration: cache → headless browser print.
 */
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, SingleFlight, type Cache } from './cache/index.js';
import type { Renderer } from './renderer.js';

export type PdfFormat = 'A4' | 'Letter';

export interface PdfRequest {
  readonly url: string;
  readonly format: PdfFormat;
  readonly landscape: boolean;
  /** Print CSS backgrounds (Chromium drops them by default, like a real printer). */
  readonly printBackground: boolean;
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
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.pdfTtlSeconds;
    const key = cacheKey('pdf', {
      url: target.href,
      format: request.format,
      landscape: request.landscape,
      printBackground: request.printBackground,
    });

    if (!request.force) {
      const hit = await this.cache.get(key);
      if (hit !== null) return { pdf: hit, cached: true, ttlSeconds };
    }

    const pdf = await this.flights.run(key, async () => {
      const fresh = await this.render(target, request);
      await this.cache.set(key, fresh, ttlSeconds);
      return fresh;
    });
    return { pdf, cached: false, ttlSeconds };
  }

  private render(target: URL, request: PdfRequest): Promise<Buffer> {
    const { maxBytes } = this.config.pdf;
    return this.renderer.render(
      target,
      {
        waitUntil: 'load',
        settleMs: 3000,
        contextOptions: { viewport: { width: 1280, height: 800 } },
      },
      async ({ page, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);

        // Wait for web fonts so text is not printed in a fallback face.
        await page.evaluate('document.fonts.ready.then(() => undefined)').catch(() => undefined);

        const pdf = await page.pdf({
          format: request.format,
          landscape: request.landscape,
          printBackground: request.printBackground,
          pageRanges: `1-${MAX_PAGES}`,
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
