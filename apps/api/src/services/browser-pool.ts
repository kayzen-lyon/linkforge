/**
 * Headless-browser pool.
 *
 * Launching Chromium costs hundreds of milliseconds and ~150 MB, so one
 * process is shared by many jobs; isolation comes from giving each job its own
 * incognito `BrowserContext` (separate cookies, cache and storage).
 *
 * Memory-leak defences:
 * - **Bounded concurrency**: at most `maxConcurrency` pages at once, with a
 *   bounded FIFO queue and an acquire timeout (load shedding instead of OOM).
 * - **Guaranteed cleanup**: the context is closed in a `finally`, whatever
 *   happens to the job (success, error, timeout).
 * - **One deadline** per request, covering the wait for a slot, the launch
 *   and the job, so a hung page cannot hold a slot forever.
 * - **No direct network access**: Chromium only reaches the network through
 *   the validating egress proxy (`security/egress-proxy.ts`).
 * - **Recycling**: a Chromium process is retired after `maxUsesPerBrowser`
 *   jobs (long-lived browsers slowly leak), once its in-flight jobs finish.
 * - **Crash recovery**: a disconnected browser is dropped and lazily replaced.
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type LaunchOptions,
  type Page,
} from 'playwright-core';

import type { AppConfig } from '../config.js';
import type { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import type { EgressProxy } from '../security/egress-proxy.js';

export interface PoolLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface PoolStats {
  readonly active: number;
  readonly queued: number;
  readonly maxConcurrency: number;
  readonly browserConnected: boolean;
}

export interface JobOptions {
  /** Viewport, user agent, device scale factor... */
  readonly contextOptions?: BrowserContextOptions;
  /** Deadline of the request: waiting for a slot, launching and the job all fit in it. */
  readonly deadline: Deadline;
}

/** A running Chromium process and its bookkeeping. */
interface Slot {
  readonly browser: Browser;
  /** Desktop user agent of this very build, without the "Headless" marker. */
  readonly userAgent: string;
  /** Major version of the build, to keep device presets consistent with it. */
  readonly majorVersion: string;
  /** Total number of jobs ever assigned to this process. */
  uses: number;
  /** Jobs currently running on this process. */
  active: number;
  /** When true, no new job is assigned and the process exits once idle. */
  retiring: boolean;
}

interface OpenedPage {
  readonly slot: Slot;
  readonly context: BrowserContext;
  readonly page: Page;
}

interface Waiter {
  resolve(): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

/** Flags that make Chromium lighter and container-friendly. */
const CHROMIUM_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
];

/**
 * Flags that are part of the security model or of the browser's identity;
 * they are added to both the regular and the serverless build.
 */
const REQUIRED_ARGS = [
  // Chromium must never resolve a name itself: every lookup happens in the
  // egress proxy. (The proxy is addressed by IP, hence the exclusion.)
  '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1',
  // WebRTC would otherwise send UDP straight to arbitrary addresses, around the proxy.
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  // Do not announce automation through `navigator.webdriver`.
  '--disable-blink-features=AutomationControlled',
];

/** Time granted to close a context before the answer is sent anyway. */
const CLEANUP_GRACE_MS = 2000;
/** Below this, waiting for a slot is pointless: the job could not run anyway. */
const MIN_JOB_MS = 3000;

/**
 * Picks the Chromium build to launch.
 *
 * Serverless functions cannot run the regular Playwright browser (missing
 * system libraries, size limits): there we use `@sparticuz/chromium`, a
 * compressed build that unpacks itself into `/tmp` on first use. The import is
 * dynamic so local development never loads it.
 */
async function resolveLaunchOptions(config: AppConfig['browser']): Promise<LaunchOptions> {
  if (!config.serverless) return { headless: true, args: [...CHROMIUM_ARGS, ...REQUIRED_ARGS] };

  const { default: serverlessChromium } = await import('@sparticuz/chromium');
  let executablePath: string;
  try {
    executablePath = await serverlessChromium.executablePath();
  } catch {
    // The compressed binary was not shipped with the function (the platform's
    // file tracing skipped it): download the matching pack into /tmp instead.
    executablePath = await serverlessChromium.executablePath(config.serverlessPackUrl);
  }
  return {
    headless: true,
    args: [...serverlessChromium.args, ...REQUIRED_ARGS],
    executablePath,
  };
}

export class BrowserPool {
  private slot: Slot | null = null;
  private launching: Promise<Slot> | null = null;
  private active = 0;
  private closed = false;
  private readonly waiters: Waiter[] = [];

  constructor(
    private readonly config: AppConfig['browser'],
    private readonly logger: PoolLogger,
    private readonly egress: EgressProxy,
  ) {}

  /**
   * Runs a job against a fresh, isolated page.
   *
   * @param options - Context options and the job's hard deadline.
   * @param job - Receives the page and its context; both are destroyed afterwards.
   * @throws {AppError} `EBUSY` when the queue is full or no slot frees up in
   *   time, `ETIMEOUT` when the job exceeds its deadline, `EBROWSER` when
   *   Chromium cannot be started.
   */
  async withPage<T>(
    options: JobOptions,
    job: (page: Page, context: BrowserContext) => Promise<T>,
  ): Promise<T> {
    if (this.closed) throw AppError.browser('The browser pool is shut down');

    const { deadline } = options;
    await this.acquire(deadline.budget(this.config.acquireTimeoutMs, MIN_JOB_MS));

    // From here on a single timer covers the launch, the page and the job.
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(AppError.timeout(`Rendering exceeded the ${deadline.totalMs} ms request budget`));
      }, deadline.remaining());
    });
    timedOut.catch(() => undefined);

    const opening = this.openPage(options.contextOptions);
    // Runs once the page exists, even when the deadline fired during the launch.
    const cleanup = (): Promise<void> =>
      opening.then(
        async (opened) => {
          await opened.context.close().catch((error: unknown) => {
            this.logger.warn({ err: error }, 'failed to close browser context');
          });
          opened.slot.active -= 1;
          this.disposeIfIdle(opened.slot);
        },
        () => undefined,
      );
    let isOpen = false;

    try {
      const opened = await Promise.race([opening, timedOut]);
      isOpen = true;
      const running = job(opened.page, opened.context);
      // If the deadline wins, the job later rejects when its context closes: swallow it.
      running.catch(() => undefined);
      return await Promise.race([running, timedOut]);
    } finally {
      clearTimeout(timer);
      // The page is closed as soon as it exists; a browser that no longer
      // answers must not delay the response beyond a short grace period.
      const cleaned = cleanup();
      if (isOpen) {
        let grace: NodeJS.Timeout | undefined;
        await Promise.race([
          cleaned,
          new Promise<void>((resolve) => {
            grace = setTimeout(resolve, CLEANUP_GRACE_MS);
          }),
        ]);
        clearTimeout(grace);
      }
      this.release();
    }
  }

  /**
   * Opens an isolated page on the current browser.
   *
   * A browser can die between two jobs (crash, OOM kill, or a serverless
   * build that exits with its last page). When that happens the dead process
   * is discarded and the page is opened once more on a fresh one.
   */
  private async openPage(
    contextOptions: BrowserContextOptions | undefined,
    attempt = 0,
  ): Promise<OpenedPage> {
    let slot = await this.getSlot();
    // Jobs that awaited the same launch may already have used this browser up.
    while (slot.retiring || !slot.browser.isConnected()) slot = await this.getSlot();
    slot.uses += 1;
    slot.active += 1;
    if (slot.uses >= this.config.maxUsesPerBrowser) this.retire(slot);

    let context: BrowserContext | null = null;
    try {
      const presetAgent = contextOptions?.userAgent;
      context = await slot.browser.newContext({
        // Service workers would let requests escape `context.route()`.
        serviceWorkers: 'block',
        ...contextOptions,
        // One coherent identity: the version announced is the version running.
        userAgent:
          presetAgent === undefined
            ? slot.userAgent
            : presetAgent.replace(/Chrome\/[\d.]+/, `Chrome/${slot.majorVersion}.0.0.0`),
      });
      const page = await context.newPage();
      await this.alignClientHints(context, page, slot, contextOptions?.isMobile === true);
      return { slot, context, page };
    } catch (error) {
      await context?.close().catch(() => undefined);
      slot.active -= 1;
      if (!slot.retiring) this.retire(slot);
      this.disposeIfIdle(slot);

      if (attempt === 0 && !this.closed) return this.openPage(contextOptions, 1);
      throw AppError.browser('Could not open a browser page', error);
    }
  }

  /**
   * Makes the User-Agent Client Hints (`sec-ch-ua`, `navigator.userAgentData`)
   * say the same thing as the `User-Agent` header. Overriding the header alone
   * leaves "HeadlessChrome" in the hints: two identities in one request.
   * Best effort: a failure here must not fail the job.
   */
  private async alignClientHints(
    context: BrowserContext,
    page: Page,
    slot: Slot,
    mobile: boolean,
  ): Promise<void> {
    try {
      const userAgent = (await page.evaluate('navigator.userAgent')) as string;
      // The session lives as long as the page: the override ends with it.
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setUserAgentOverride', {
        userAgent,
        userAgentMetadata: {
          brands: [
            { brand: 'Chromium', version: slot.majorVersion },
            { brand: 'Not_A Brand', version: '8' },
          ],
          fullVersionList: [
            { brand: 'Chromium', version: `${slot.majorVersion}.0.0.0` },
            { brand: 'Not_A Brand', version: '8.0.0.0' },
          ],
          platform: mobile ? 'Android' : 'Linux',
          platformVersion: '',
          architecture: mobile ? '' : 'x86',
          model: '',
          mobile,
        },
      });
    } catch (error) {
      this.logger.warn({ err: error }, 'could not align user-agent client hints');
    }
  }

  /** Live counters, exposed by the health endpoint. */
  stats(): PoolStats {
    return {
      active: this.active,
      queued: this.waiters.length,
      maxConcurrency: this.config.maxConcurrency,
      browserConnected: this.slot?.browser.isConnected() ?? false,
    };
  }

  /** Rejects queued jobs and closes Chromium. Idempotent. */
  async close(): Promise<void> {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(AppError.browser('The browser pool is shutting down'));
    }
    const pending = this.launching;
    const slot = this.slot ?? (pending !== null ? await pending.catch(() => null) : null);
    this.slot = null;
    if (slot !== null) await slot.browser.close().catch(() => undefined);
  }

  /** Takes a concurrency permit, queueing when the pool is saturated. */
  private acquire(timeoutMs: number): Promise<void> {
    if (this.active < this.config.maxConcurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.waiters.length >= this.config.maxQueue || timeoutMs <= 0) {
      return Promise.reject(AppError.busy('Too many rendering jobs in progress, retry shortly'));
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index !== -1) this.waiters.splice(index, 1);
          reject(AppError.busy('Timed out waiting for a free browser slot, retry shortly'));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  /** Returns a permit, handing it directly to the next queued job if any. */
  private release(): void {
    const next = this.waiters.shift();
    if (next !== undefined) {
      clearTimeout(next.timer);
      next.resolve(); // The permit is transferred: `active` is unchanged.
      return;
    }
    this.active -= 1;
  }

  /** Returns the current Chromium process, launching one if needed. */
  private async getSlot(): Promise<Slot> {
    const current = this.slot;
    if (current !== null && !current.retiring && current.browser.isConnected()) return current;

    // Concurrent callers share a single launch.
    this.launching ??= this.launch().finally(() => {
      this.launching = null;
    });
    return this.launching;
  }

  private async launch(): Promise<Slot> {
    let browser: Browser;
    try {
      const proxy = await this.egress.endpoint();
      browser = await chromium.launch({
        ...(await resolveLaunchOptions(this.config)),
        // The only route to the network. Chromium skips proxies for loopback
        // unless told otherwise: `<-loopback>` removes that implicit bypass.
        proxy: { ...proxy, bypass: '<-loopback>' },
      });
    } catch (error) {
      throw AppError.browser('Could not start the headless browser', error);
    }

    const majorVersion = browser.version().split('.')[0] ?? '0';
    const slot: Slot = {
      browser,
      majorVersion,
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        `Chrome/${majorVersion}.0.0.0 Safari/537.36`,
      uses: 0,
      active: 0,
      retiring: false,
    };
    browser.on('disconnected', () => {
      if (this.slot === slot) {
        this.slot = null;
        if (!this.closed) this.logger.warn({}, 'browser disconnected, it will be relaunched');
      }
    });
    this.slot = slot;
    this.logger.info({ version: browser.version() }, 'browser launched');
    return slot;
  }

  /** Stops assigning jobs to a process; it exits once its jobs complete. */
  private retire(slot: Slot): void {
    slot.retiring = true;
    if (this.slot === slot) this.slot = null;
    this.logger.info({ uses: slot.uses }, 'browser scheduled for recycling');
  }

  private disposeIfIdle(slot: Slot): void {
    if (slot.retiring && slot.active === 0) {
      void slot.browser.close().catch(() => undefined);
    }
  }
}
