/**
 * Screenshot orchestration: cache → headless browser capture.
 */
import { devices, type BrowserContextOptions, type Page } from 'playwright-core';

import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, SingleFlight, type Cache } from './cache/index.js';
import type { Renderer } from './renderer.js';

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

/** Bounds of the `hide` parameter. */
const MAX_HIDE_SELECTORS = 20;
const MAX_HIDE_SELECTOR_LENGTH = 200;
/** How long a `selector` target may take to appear once the page has settled. */
const SELECTOR_TIMEOUT_MS = 3000;

/**
 * Splits the `hide` parameter into individual selectors.
 *
 * Commas nested in `()`, `[]` or quotes belong to a selector (`:is(a, b)`).
 * Characters that could close the generated rule and open another one are
 * refused outright rather than escaped: no legitimate selector needs them.
 *
 * @throws {AppError} `EINVALIDPARAMS` when a selector is refused or a bound is exceeded.
 */
export function parseHideSelectors(raw: string): string[] {
  if (/[{}<;@]|\/\*/.test(raw)) {
    throw AppError.invalidParams('hide: selectors must not contain { } ; @ < or comments');
  }

  const selectors: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw.charAt(i);
    if (char === '\\') {
      // A CSS escape protects the next character (`.md\:flex`, `\,`).
      current += char + raw.charAt(i + 1);
      i += 1;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1);
    } else if (char === ',' && depth === 0) {
      selectors.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  selectors.push(current);

  const cleaned = selectors.map((selector) => selector.trim()).filter((selector) => selector !== '');
  if (cleaned.length > MAX_HIDE_SELECTORS) {
    throw AppError.invalidParams(`hide: at most ${MAX_HIDE_SELECTORS} selectors are allowed`);
  }
  if (cleaned.some((selector) => selector.length > MAX_HIDE_SELECTOR_LENGTH)) {
    throw AppError.invalidParams(
      `hide: a selector is longer than ${MAX_HIDE_SELECTOR_LENGTH} characters`,
    );
  }
  return cleaned;
}

/**
 * Runs **inside the page** (serialised by Playwright, so it must be
 * self-contained). Hides elements through a constructed stylesheet:
 * `insertRule` accepts exactly one rule, so a selector can never smuggle in
 * extra CSS, and an invalid one is skipped without affecting the others.
 * Selectors travel as an evaluation argument, never as source code.
 */
function hideElementsInPage(selectors: string[]): void {
  const scope = globalThis as unknown as {
    CSSStyleSheet: new () => { insertRule(rule: string): number };
    document: { adoptedStyleSheets: unknown[] };
  };
  const sheet = new scope.CSSStyleSheet();
  for (const selector of selectors) {
    try {
      sheet.insertRule(`${selector} { display: none !important; }`);
    } catch {
      // Not a selector this browser understands: nothing to hide.
    }
  }
  scope.document.adoptedStyleSheets = [...scope.document.adoptedStyleSheets, sheet];
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
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const contentType = request.format === 'png' ? 'image/png' : 'image/jpeg';
    const hide = request.hide === null ? [] : parseHideSelectors(request.hide);
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.screenshotTtlSeconds;
    const key = cacheKey('screenshot', {
      url: target.href,
      device: request.device,
      fullPage: request.fullPage,
      format: request.format,
      quality: request.format === 'jpeg' ? request.quality : null,
      width: request.width,
      height: request.height,
      selector: request.selector,
      waitForMs: request.waitForMs,
      colorScheme: request.colorScheme,
      hide,
    });

    if (!request.force) {
      const hit = await this.cache.get(key);
      if (hit !== null) return { image: hit, contentType, cached: true, ttlSeconds };
    }

    const image = await this.flights.run(key, async () => {
      const fresh = await this.render(target, request, hide);
      await this.cache.set(key, fresh, ttlSeconds);
      return fresh;
    });
    return { image, contentType, cached: false, ttlSeconds };
  }

  private render(
    target: URL,
    request: ScreenshotRequest,
    hide: readonly string[],
  ): Promise<Buffer> {
    const preset = DEVICE_PRESETS[request.device];
    const presetViewport = preset.viewport ?? { width: 1280, height: 800 };

    return this.renderer.render(
      target,
      {
        waitUntil: 'load',
        settleMs: 3000,
        extraBudgetMs: request.waitForMs + (request.selector === null ? 0 : SELECTOR_TIMEOUT_MS),
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

        await page.addStyleTag({ content: FREEZE_MOTION_CSS }).catch(() => undefined);
        // Wait for web fonts so text is not captured in a fallback face.
        await page
          .evaluate('document.fonts.ready.then(() => undefined)')
          .catch(() => undefined);

        if (hide.length > 0) {
          await page.evaluate(hideElementsInPage, [...hide]).catch(() => undefined);
        }
        if (request.waitForMs > 0) await page.waitForTimeout(request.waitForMs);

        if (request.selector !== null) return this.captureElement(page, request.selector, request);

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
    const element = page.locator(`css=${selector}`).first();
    try {
      await element.waitFor({ state: 'visible', timeout: SELECTOR_TIMEOUT_MS });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw AppError.selectorNotFound('No visible element matches `selector`');
      }
      if (error instanceof Error && /while parsing (css )?selector/i.test(error.message)) {
        throw AppError.invalidParams('selector: not a valid CSS selector');
      }
      throw error;
    }

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
