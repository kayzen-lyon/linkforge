/**
 * Shared browser-navigation helper used by every service that renders a page.
 */
import type { BrowserContext, BrowserContextOptions, Page, Response } from 'playwright-core';

import type { AppConfig } from '../config.js';
import type { Deadline } from '../lib/deadline.js';
import { AppError, findAppError } from '../lib/errors.js';
import { installBrowserGuard, type BrowserGuardOptions } from '../security/browser-guard.js';
import type { EgressProxy } from '../security/egress-proxy.js';
import type { BrowserPool } from './browser-pool.js';

export interface RenderOptions {
  readonly contextOptions?: BrowserContextOptions;
  readonly guard?: BrowserGuardOptions;
  /**
   * Milestone the page should reach before the job runs. It is a wish, not a
   * condition: when it is not reached within the navigation budget, loading is
   * stopped and the job runs on what has rendered.
   */
  readonly waitUntil: 'domcontentloaded' | 'load';
  /** Extra time granted for the network to go quiet (best effort, never fails). */
  readonly settleMs: number;
  /** Deadline of the request; every wait below is sized from what is left of it. */
  readonly deadline: Deadline;
  /** Time to keep for the job itself (extraction, capture, print). */
  readonly reserveMs: number;
  /** CSS selector that must be attached to the DOM before the job runs. */
  readonly waitForSelector?: string | null;
}

export interface RenderedPage {
  readonly page: Page;
  readonly context: BrowserContext;
  /** Main-document response (`null` for some same-document navigations). */
  readonly response: Response | null;
  /** False when `waitUntil` was not reached and loading had to be stopped. */
  readonly loaded: boolean;
}

/** Longest wait for `waitForSelector`, when the deadline leaves that much. */
export const WAIT_FOR_SELECTOR_TIMEOUT_MS = 10_000;
/** A navigation is not even attempted with less time than this. */
const MIN_NAVIGATION_MS = 1000;

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

/** `host:port` of a URL, in the form the egress proxy reports refusals. */
function destinationOf(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const port = url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80';
    return `${url.hostname.toLowerCase()}:${port}`;
  } catch {
    return null;
  }
}

/**
 * Waits for `selector` (CSS only) to be attached to the DOM.
 *
 * @throws {AppError} `ESELECTORNOTFOUND` on timeout, `EINVALIDPARAMS` when the
 *   browser cannot parse the selector.
 */
export async function waitForCss(
  page: Page,
  selector: string,
  state: 'attached' | 'visible',
  timeoutMs: number,
  name: string,
): Promise<void> {
  try {
    // The `css=` prefix pins the dialect: other engines become syntax errors.
    await page
      .locator(`css=${selector}`)
      .first()
      .waitFor({ state, timeout: Math.max(1, timeoutMs) });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw AppError.selectorNotFound(
        `No ${state === 'visible' ? 'visible ' : ''}element matches \`${name}\``,
      );
    }
    if (error instanceof Error && /while parsing (css )?selector|unknown engine/i.test(error.message)) {
      throw AppError.invalidParams(`${name}: not a valid CSS selector`);
    }
    throw error;
  }
}

export class Renderer {
  constructor(
    private readonly pool: BrowserPool,
    private readonly config: AppConfig,
    private readonly egress: EgressProxy,
  ) {}

  /**
   * Opens `url` in an isolated, SSRF-guarded page and runs `job` on it.
   *
   * The page is handed over as soon as it has something to show: a `load`
   * event that never fires (hung tracker, endless stream) does not fail the
   * request.
   *
   * @throws {AppError} `EFORBIDDENURL`, `ETIMEOUT`, `EUNREACHABLE`, `EBUSY`,
   *   `EBROWSER`, or `ESELECTORNOTFOUND` with `waitForSelector`.
   */
  async render<T>(
    url: URL,
    options: RenderOptions,
    job: (rendered: RenderedPage) => Promise<T>,
  ): Promise<T> {
    const { deadline, reserveMs } = options;
    // Destinations the proxy refused while this job was running.
    const refused = new Set<string>();
    const unsubscribe = this.egress.onBlocked((destination) => refused.add(destination));

    try {
      return await this.pool.withPage(
        {
          deadline,
          ...(options.contextOptions !== undefined && { contextOptions: options.contextOptions }),
        },
        async (page, context) => {
          const guard = await installBrowserGuard(context, this.config.ssrf, options.guard);
          // Never let a page block the job with alert()/confirm()/beforeunload.
          page.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));

          // Each redirect hop is a new request: the last one is where the document comes from.
          let documentUrl = url.href;
          page.on('request', (request) => {
            if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
              documentUrl = request.url();
            }
          });
          const blocked = (): boolean =>
            guard.navigationBlocked || refused.has(destinationOf(documentUrl) ?? '');

          const navigationBudget = deadline.budget(
            this.config.browser.navigationTimeoutMs,
            reserveMs,
          );
          if (navigationBudget < MIN_NAVIGATION_MS) {
            throw AppError.timeout('Not enough time left to load the page');
          }
          const navigationEnds = performance.now() + navigationBudget;

          let response: Response | null;
          try {
            // `commit`: the response has started. Waiting for `load` here would
            // turn a slow third-party script into a failed request.
            response = await page.goto(url.href, { waitUntil: 'commit', timeout: navigationBudget });
          } catch (error) {
            throw normalizeNavigationError(error, url, blocked());
          }
          // A refused plain-http hop is answered by the proxy itself, with a 403.
          if (blocked()) throw normalizeNavigationError(null, url, true);

          const loaded = await page
            .waitForLoadState(options.waitUntil, {
              timeout: Math.max(1, Math.min(navigationEnds - performance.now(), deadline.budget(Infinity, reserveMs))),
            })
            .then(
              () => true,
              () => false,
            );
          if (!loaded) await this.stopLoading(page, context);

          if (loaded && options.settleMs > 0) {
            const settle = deadline.budget(options.settleMs, reserveMs);
            if (settle > 0) {
              await page.waitForLoadState('networkidle', { timeout: settle }).catch(() => undefined);
            }
          }
          // A client-side navigation may have been refused after the first document.
          if (blocked()) throw normalizeNavigationError(null, url, true);

          const selector = options.waitForSelector ?? null;
          if (selector !== null) {
            await waitForCss(
              page,
              selector,
              'attached',
              deadline.budget(WAIT_FOR_SELECTOR_TIMEOUT_MS, reserveMs),
              'waitForSelector',
            );
          }
          return job({ page, context, response, loaded });
        },
      );
    } finally {
      unsubscribe();
    }
  }

  /** Aborts pending loads so the page can be read or captured as it is. */
  private async stopLoading(page: Page, context: BrowserContext): Promise<void> {
    try {
      const session = await context.newCDPSession(page);
      await Promise.race([
        session.send('Page.stopLoading'),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      await session.detach().catch(() => undefined);
    } catch {
      // The page is gone or unresponsive: the job will report it.
    }
  }
}
