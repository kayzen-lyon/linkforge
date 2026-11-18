/**
 * Colour palette of an image (`/palette`).
 *
 * No pixel library is bundled. An 8-bit PNG is inflated with `node:zlib` and
 * read in process. Every other format (JPEG, WebP, AVIF, GIF, SVG) is decoded
 * by the Chromium that is already there: the image is opened through the
 * guarded browser path, shown shrunk in a small viewport, captured as PNG,
 * and that PNG is read the same way.
 */
import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import { readImageHeader } from '../lib/image-header.js';
import { extractPalette, type PaletteColor } from '../lib/palette.js';
import { decodePng } from '../lib/png.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, getJson, setJson, SingleFlight, type Cache } from './cache/index.js';
import type { SafeFetcher } from './fetcher.js';
import { extractMetadata } from './meta-extractor.js';
import { HTML_TYPES } from './page-loader.js';
import type { Renderer } from './renderer.js';

export interface PaletteData {
  /** URL of the image analysed (after redirects). */
  readonly url: string;
  /** The page it was found on, when `url` was a page. */
  readonly pageUrl: string | null;
  readonly format: string | null;
  /** The colour with the largest population. */
  readonly dominant: string;
  readonly colors: readonly PaletteColor[];
}

export interface PaletteResult {
  readonly data: PaletteData;
  /** `http`: PNG decoded in process. `browser`: decoded by Chromium. */
  readonly source: 'http' | 'browser';
  readonly cached: boolean;
  readonly ttlSeconds: number;
}

/** Largest PNG downloaded and decoded in process; larger ones go through the browser. */
const DIRECT_MAX_BYTES = 4 * 1024 * 1024;
const DIRECT_MAX_PIXELS = 4_000_000;
/** Side of the viewport the browser shows the image in: plenty for a palette. */
const THUMBNAIL = 160;

export class PaletteService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly fetcher: SafeFetcher,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Palette of an image, or of the main preview image of a page.
   *
   * @throws {AppError} `EEMBEDNOTFOUND` when a page declares no image,
   *   `ENOTHTML`-free: a target that is neither a page nor an image is `ETARGETSTATUS`/`EEMBEDNOTFOUND`.
   */
  async palette(request: { url: string; count: number; force: boolean; ttlSeconds: number | null }): Promise<PaletteResult> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.metaTtlSeconds;
    const key = cacheKey('palette', { url: target.href, count: request.count });
    if (!request.force) {
      const hit = await getJson<Pick<PaletteResult, 'data' | 'source'>>(this.cache, key);
      if (hit !== null) return { ...hit, cached: true, ttlSeconds };
    }
    const fresh = await this.flights.run(key, async () => {
      const result = await this.compute(target, request.count, deadline);
      await setJson(this.cache, key, result, ttlSeconds);
      return result;
    });
    return { ...fresh, cached: false, ttlSeconds };
  }

  private async compute(target: URL, count: number, deadline: Deadline): Promise<Pick<PaletteResult, 'data' | 'source'>> {
    const read = (url: URL) =>
      this.fetcher.fetchBytes(url, { maxBytes: DIRECT_MAX_BYTES, accept: 'image/*,text/html;q=0.8,*/*;q=0.5' });
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
    const done = (pixels: Buffer, channels: 3 | 4, source: 'http' | 'browser') => {
      const colors = extractPalette(pixels, channels, count);
      const [first] = colors;
      if (first === undefined) throw AppError.embedNotFound('The image has no visible pixel');
      return {
        data: { url: file.finalUrl, pageUrl, format: header?.format ?? null, dominant: first.hex, colors },
        source,
      };
    };

    if (header?.format === 'png' && !file.truncated) {
      try {
        const decoded = decodePng(file.body, DIRECT_MAX_PIXELS);
        return done(decoded.pixels, decoded.channels, 'http');
      } catch {
        // Palette, 16-bit or interlaced PNG: Chromium reads those.
      }
    }
    if (header === null && !/^image\//.test(file.contentType ?? '')) {
      throw AppError.embedNotFound('The target is not an image');
    }

    const capture = await this.renderer.render(
      new URL(file.finalUrl),
      {
        waitUntil: 'load',
        settleMs: 0,
        deadline,
        reserveMs: 3000,
        // Chromium shows an image larger than the viewport shrunk to fit it.
        contextOptions: { viewport: { width: THUMBNAIL, height: THUMBNAIL }, deviceScaleFactor: 1, javaScriptEnabled: false },
      },
      async ({ page, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);
        const image = page.locator('css=img, svg').first();
        if ((await image.count()) === 0) throw AppError.embedNotFound('The target is not an image');
        return image.screenshot({ type: 'png', omitBackground: true, timeout: 3000 });
      },
    );
    const decoded = decodePng(capture, THUMBNAIL * THUMBNAIL * 4);
    return done(decoded.pixels, decoded.channels, 'browser');
  }
}
