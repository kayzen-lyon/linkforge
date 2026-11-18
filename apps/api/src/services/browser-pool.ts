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
 * - **Hard deadline** per job, so a hung page cannot hold a slot forever.
 * - **Recycling**: a Chromium process is retired after `maxUsesPerBrowser`
 *   jobs (long-lived browsers slowly leak), once its in-flight jobs finish.
 * - **Crash recovery**: a disconnected browser is dropped and lazily replaced.
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from 'playwright';

import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';

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
  /** Hard deadline for the whole job, in milliseconds. */
  readonly timeoutMs: number;
}

/** A running Chromium process and its bookkeeping. */
interface Slot {
  readonly browser: Browser;
  /** Total number of jobs ever assigned to this process. */
  uses: number;
  /** Jobs currently running on this process. */
  active: number;
  /** When true, no new job is assigned and the process exits once idle. */
  retiring: boolean;
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

export class BrowserPool {
  private slot: Slot | null = null;
  private launching: Promise<Slot> | null = null;
  private active = 0;
  private closed = false;
  private readonly waiters: Waiter[] = [];

  constructor(
    private readonly config: AppConfig['browser'],
    private readonly logger: PoolLogger,
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

    await this.acquire();
    let slot: Slot | null = null;
    let context: BrowserContext | null = null;
    let deadline: NodeJS.Timeout | undefined;

    try {
      slot = await this.getSlot();
      slot.uses += 1;
      slot.active += 1;
      if (slot.uses >= this.config.maxUsesPerBrowser) this.retire(slot);

      context = await slot.browser.newContext({
        // Service workers would let requests escape `context.route()`.
        serviceWorkers: 'block',
        ...options.contextOptions,
      });
      const page = await context.newPage();

      const timedOut = new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          reject(AppError.timeout(`Rendering exceeded ${options.timeoutMs} ms`));
        }, options.timeoutMs);
      });
      const running = job(page, context);
      // If the deadline wins, the job later rejects when its context closes: swallow it.
      running.catch(() => undefined);

      return await Promise.race([running, timedOut]);
    } finally {
      clearTimeout(deadline);
      if (context !== null) {
        await context.close().catch((error: unknown) => {
          this.logger.warn({ err: error }, 'failed to close browser context');
        });
      }
      if (slot !== null) {
        slot.active -= 1;
        this.disposeIfIdle(slot);
      }
      this.release();
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
  private acquire(): Promise<void> {
    if (this.active < this.config.maxConcurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.waiters.length >= this.config.maxQueue) {
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
        }, this.config.acquireTimeoutMs),
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
      browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
    } catch (error) {
      throw AppError.browser('Could not start the headless browser', error);
    }

    const slot: Slot = { browser, uses: 0, active: 0, retiring: false };
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
