/**
 * Screenshot orchestration: cache → headless browser capture.
 */
import { devices, type BrowserContextOptions } from 'playwright';

import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, SingleFlight, type Cache } from './cache/index.js';
import type { Renderer } from './renderer.js';

export type DeviceKind = 'desktop' | 'mobile';
export type ImageFormat = 'png' | 'jpeg';

export interface ScreenshotRequest {
  readonly url: string;
  readonly device: DeviceKind;
  readonly fullPage: boolean;
  readonly format: ImageFormat;
  /** JPEG quality (1-100); ignored for PNG. */
  readonly quality: number;
  readonly force: boolean;
}

export interface ScreenshotResult {
  readonly image: Buffer;
  readonly contentType: 'image/png' | 'image/jpeg';
  readonly cached: boolean;
}

/** Device presets. Mobile reuses Playwright's maintained descriptor (UA, DPR, touch). */
const DEVICE_PRESETS: Readonly<Record<DeviceKind, BrowserContextOptions>> = {
  desktop: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  mobile: { ...devices['Pixel 7'] },
};

/** Full-page captures are clipped to this height to bound memory usage. */
const MAX_FULL_PAGE_HEIGHT = 12_000;

/** Neutralises motion so the capture is deterministic and never mid-transition. */
const FREEZE_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
    caret-color: transparent !important;
  }
`;

export class ScreenshotService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Captures a screenshot of a web page.
   *
   * @throws {AppError} Invalid/forbidden URL, timeout, unreachable target,
   *   target HTTP error, saturated browser pool.
   */
  async capture(request: ScreenshotRequest): Promise<ScreenshotResult> {
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const contentType = request.format === 'png' ? 'image/png' : 'image/jpeg';
    const key = cacheKey('screenshot', {
      url: target.href,
      device: request.device,
      fullPage: request.fullPage,
      format: request.format,
      quality: request.format === 'jpeg' ? request.quality : null,
    });

    if (!request.force) {
      const hit = await this.cache.get(key);
      if (hit !== null) return { image: hit, contentType, cached: true };
    }

    const image = await this.flights.run(key, async () => {
      const fresh = await this.render(target, request);
      await this.cache.set(key, fresh, this.config.cache.screenshotTtlSeconds);
      return fresh;
    });
    return { image, contentType, cached: false };
  }

  private render(target: URL, request: ScreenshotRequest): Promise<Buffer> {
    return this.renderer.render(
      target,
      {
        waitUntil: 'load',
        settleMs: 3000,
        contextOptions: DEVICE_PRESETS[request.device],
      },
      async ({ page, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);

        await page.addStyleTag({ content: FREEZE_MOTION_CSS }).catch(() => undefined);
        // Wait for web fonts so text is not captured in a fallback face.
        await page
          .evaluate('document.fonts.ready.then(() => undefined)')
          .catch(() => undefined);

        const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
        const pageHeight = request.fullPage
          ? ((await page
              .evaluate('document.documentElement.scrollHeight')
              .catch(() => viewport.height)) as number)
          : viewport.height;
        const tooTall = request.fullPage && pageHeight > MAX_FULL_PAGE_HEIGHT;

        return page.screenshot({
          type: request.format,
          animations: 'disabled',
          ...(request.format === 'jpeg' && { quality: request.quality }),
          fullPage: request.fullPage,
          // With `fullPage`, the clip is expressed in page coordinates.
          ...(tooTall && {
            clip: { x: 0, y: 0, width: viewport.width, height: MAX_FULL_PAGE_HEIGHT },
          }),
        });
      },
    );
  }
}
