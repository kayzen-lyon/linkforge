/**
 * Screenshot orchestration: cache → headless browser capture.
 */
import { devices, type BrowserContextOptions, type Page } from 'playwright-core';

import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import { assertCssSelector, parseSelectorList } from '../lib/selectors.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, SingleFlight, type Cache } from './cache/index.js';
import {
  CONSENT_BANNER_SELECTORS,
  freezeMotion,
  hideElements,
  IMAGE_SETTLE_BUDGET_MS,
  SCROLL_PASS_BUDGET_MS,
  scrollThrough,
  waitForFonts,
  waitForImages,
} from './page-prep.js';
import { waitForCss, type Renderer } from './renderer.js';

export type DeviceKind = 'desktop' | 'mobile';
export type ImageFormat = 'png' | 'jpeg';
export type ColorScheme = 'light' | 'dark';

export interface ScreenshotRequest {
  readonly url: string;
  readonly device: DeviceKind;
  readonly fullPage: boolean;
  readonly format: ImageFormat;
  /** JPEG quality (1-100); ignored for PNG. */
  readonly quality: number;
  /** Viewport overrides (CSS pixels); `null` keeps the device preset's value. */
  readonly width: number | null;
  readonly height: number | null;
  /** CSS selector of the single element to capture; `null` captures the page. */
  readonly selector: string | null;
  /** Extra wait before the capture, in milliseconds. */
  readonly waitForMs: number;
  /** Emulated `prefers-color-scheme`; `null` keeps the browser default (light). */
  readonly colorScheme: ColorScheme | null;
  /** Comma-separated CSS selectors of elements to hide before the capture. */
  readonly hide: string | null;
  /** Hide common cookie / consent banners before the capture. */
  readonly hideBanners: boolean;
  /** CSS selector that must be in the DOM before the capture; `null` for none. */
  readonly waitForSelector: string | null;
  readonly force: boolean;
  /** Cache lifetime for this request; `null` uses the configured default. */
  readonly ttlSeconds: number | null;
}

export interface ScreenshotResult {
  readonly image: Buffer;
  readonly contentType: 'image/png' | 'image/jpeg';
  readonly cached: boolean;
  /** Lifetime applied to this answer (drives `Cache-Control`). */
  readonly ttlSeconds: number;
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

/** How long a `selector` target may take to appear once the page has settled. */
const SELECTOR_TIMEOUT_MS = 3000;
/** Time kept for the capture itself (encoding a tall PNG is not instant). */
const CAPTURE_RESERVE_MS = 6000;

/**
 * Splits the `hide` parameter into individual selectors.
 *
 * @throws {AppError} `EINVALIDPARAMS` when a selector is refused or a bound is exceeded.
 */
export function parseHideSelectors(raw: string): string[] {
  return parseSelectorList(raw, 'hide');
}

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
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const contentType = request.format === 'png' ? 'image/png' : 'image/jpeg';
    const hide = request.hide === null ? [] : parseHideSelectors(request.hide);
    const selector =
      request.selector === null ? null : assertCssSelector(request.selector, 'selector');
    const waitForSelector =
      request.waitForSelector === null
        ? null
        : assertCssSelector(request.waitForSelector, 'waitForSelector');
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.screenshotTtlSeconds;
    const key = cacheKey('screenshot', {
      url: target.href,
      device: request.device,
      fullPage: request.fullPage,
      format: request.format,
      quality: request.format === 'jpeg' ? request.quality : null,
      width: request.width,
      height: request.height,
      selector,
      waitForMs: request.waitForMs,
      colorScheme: request.colorScheme,
      hide,
      hideBanners: request.hideBanners,
      waitForSelector,
    });

    if (!request.force) {
      const hit = await this.cache.get(key);
      if (hit !== null) return { image: hit, contentType, cached: true, ttlSeconds };
    }

    const image = await this.flights.run(key, async () => {
      const fresh = await this.render(target, { ...request, selector, waitForSelector }, hide, deadline);
      await this.cache.set(key, fresh, ttlSeconds);
      return fresh;
    });
    return { image, contentType, cached: false, ttlSeconds };
  }

  private render(
    target: URL,
    request: ScreenshotRequest,
    hide: readonly string[],
    deadline: Deadline,
  ): Promise<Buffer> {
    const preset = DEVICE_PRESETS[request.device];
    const presetViewport = preset.viewport ?? { width: 1280, height: 800 };
    const wholePage = request.fullPage && request.selector === null;
    const prepareMs = IMAGE_SETTLE_BUDGET_MS + (wholePage ? SCROLL_PASS_BUDGET_MS : 0);

    return this.renderer.render(
      target,
      {
        waitUntil: 'load',
        settleMs: 3000,
        deadline,
        reserveMs:
          CAPTURE_RESERVE_MS +
          prepareMs +
          request.waitForMs +
          (request.selector === null ? 0 : SELECTOR_TIMEOUT_MS),
        waitForSelector: request.waitForSelector,
        contextOptions: {
          ...preset,
          // Only the size is overridden: a mobile preset keeps its UA, DPR and touch.
          viewport: {
            width: request.width ?? presetViewport.width,
            height: request.height ?? presetViewport.height,
          },
          ...(request.colorScheme !== null && { colorScheme: request.colorScheme }),
        },
      },
      async ({ page, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);

        await freezeMotion(page);
        await waitForFonts(page, 2000);
        if (request.hideBanners) await hideElements(page, CONSENT_BANNER_SELECTORS);
        await hideElements(page, hide);
        if (request.waitForMs > 0) await page.waitForTimeout(request.waitForMs);

        if (request.selector !== null) {
          await waitForImages(page, MAX_FULL_PAGE_HEIGHT, deadline.budget(IMAGE_SETTLE_BUDGET_MS, CAPTURE_RESERVE_MS));
          return this.captureElement(page, request.selector, request);
        }

        const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
        if (request.fullPage) {
          // Lazy content only exists once it has been scrolled into view.
          await scrollThrough(
            page,
            MAX_FULL_PAGE_HEIGHT,
            deadline.budget(SCROLL_PASS_BUDGET_MS, CAPTURE_RESERVE_MS + IMAGE_SETTLE_BUDGET_MS),
          );
        }
        const pageHeight = request.fullPage
          ? ((await page
              .evaluate('document.documentElement.scrollHeight')
              .catch(() => viewport.height)) as number)
          : viewport.height;
        const tooTall = request.fullPage && pageHeight > MAX_FULL_PAGE_HEIGHT;
        await waitForImages(
          page,
          Math.min(pageHeight, MAX_FULL_PAGE_HEIGHT),
          deadline.budget(IMAGE_SETTLE_BUDGET_MS, CAPTURE_RESERVE_MS),
        );

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

  /**
   * Captures the first element matching `selector`.
   *
   * The selector is untrusted: it is only ever handed to Playwright's selector
   * engine, pinned to the CSS dialect so other engines (`xpath=`, `text=`) are
   * rejected as syntax errors.
   */
  private async captureElement(
    page: Page,
    selector: string,
    request: ScreenshotRequest,
  ): Promise<Buffer> {
    await waitForCss(page, selector, 'visible', SELECTOR_TIMEOUT_MS, 'selector');
    const element = page.locator(`css=${selector}`).first();

    const options = {
      type: request.format,
      animations: 'disabled',
      ...(request.format === 'jpeg' && { quality: request.quality }),
    } as const;

    const box = await element.boundingBox();
    if (box !== null && box.height > MAX_FULL_PAGE_HEIGHT) {
      // Same memory bound as full-page captures: clip instead of capturing it all.
      const [scrollX, scrollY] = (await page.evaluate('[window.scrollX, window.scrollY]')) as [
        number,
        number,
      ];
      return page.screenshot({
        ...options,
        fullPage: true,
        clip: {
          x: box.x + scrollX,
          y: box.y + scrollY,
          width: box.width,
          height: MAX_FULL_PAGE_HEIGHT,
        },
      });
    }
    return element.screenshot(options);
  }
}
