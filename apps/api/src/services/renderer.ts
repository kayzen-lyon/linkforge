/**
 * Shared browser-navigation helper used by the metadata and screenshot services.
 */
import type { BrowserContext, BrowserContextOptions, Page, Response } from 'playwright';

import type { AppConfig } from '../config.js';
import { AppError, findAppError } from '../lib/errors.js';
import { installBrowserGuard, type BrowserGuardOptions } from '../security/browser-guard.js';
import type { BrowserPool } from './browser-pool.js';

export interface RenderOptions {
  readonly contextOptions?: BrowserContextOptions;
  readonly guard?: BrowserGuardOptions;
  /** Navigation milestone to wait for before handing the page over. */
  readonly waitUntil: 'domcontentloaded' | 'load';
  /** Extra time granted for the network to go quiet (best effort, never fails). */
  readonly settleMs: number;
}

export interface RenderedPage {
  readonly page: Page;
  readonly context: BrowserContext;
  /** Main-document response (`null` for some same-document navigations). */
  readonly response: Response | null;
}

/** Translates Chromium `net::ERR_*` failures into domain errors. */
function normalizeNavigationError(error: unknown, url: URL, blockedByPolicy: boolean): AppError {
  const appError = findAppError(error);
  if (appError !== undefined) return appError;

  if (blockedByPolicy) {
    return AppError.forbiddenUrl('The page redirects to a destination that is not allowed');
  }

  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';

  if (name === 'TimeoutError' || message.includes('ERR_TIMED_OUT')) {
    return AppError.timeout(`Navigation to ${url.host} timed out`, error);
  }
  const netError = message.match(/net::(ERR_[A-Z_]+)/)?.[1];
  if (netError !== undefined) {
    return AppError.unreachable(`Could not load ${url.host} (${netError})`, error);
  }
  return AppError.browser('The page could not be rendered', error);
}

export class Renderer {
  constructor(
    private readonly pool: BrowserPool,
    private readonly config: AppConfig,
  ) {}

  /**
   * Opens `url` in an isolated, SSRF-guarded page and runs `job` on it.
   *
   * @throws {AppError} `EFORBIDDENURL`, `ETIMEOUT`, `EUNREACHABLE`, `EBUSY` or `EBROWSER`.
   */
  async render<T>(
    url: URL,
    options: RenderOptions,
    job: (rendered: RenderedPage) => Promise<T>,
  ): Promise<T> {
    const navigationTimeout = this.config.browser.navigationTimeoutMs;
    // Navigation + settle + a margin for the job itself (extraction or capture).
    const deadline = navigationTimeout + options.settleMs + 10_000;

    return this.pool.withPage(
      {
        timeoutMs: deadline,
        ...(options.contextOptions !== undefined && { contextOptions: options.contextOptions }),
      },
      async (page, context) => {
        const guard = await installBrowserGuard(context, this.config.ssrf, options.guard);
        // Never let a page block the job with alert()/confirm()/beforeunload.
        page.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));

        let response: Response | null;
        try {
          response = await page.goto(url.href, {
            waitUntil: options.waitUntil,
            timeout: navigationTimeout,
          });
        } catch (error) {
          throw normalizeNavigationError(error, url, guard.navigationBlocked);
        }

        if (options.settleMs > 0) {
          await page
            .waitForLoadState('networkidle', { timeout: options.settleMs })
            .catch(() => undefined);
        }
        return job({ page, context, response });
      },
    );
  }
}
