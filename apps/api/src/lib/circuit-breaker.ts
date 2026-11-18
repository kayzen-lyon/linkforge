/**
 * Per-target-host circuit breaker.
 *
 * A host that keeps timing out or refusing connections costs a full timeout
 * (and, on the browser path, a rendering slot) per request. After
 * `threshold` consecutive network failures the host is short-circuited for
 * `cooldownMs`: callers get `ECIRCUITOPEN` at once. Then one trial request is
 * let through; its outcome closes or re-opens the circuit.
 *
 * State lives in memory, per instance, and is bounded: it is a load-shedding
 * aid, not a shared verdict on a site.
 */
import { AppError, ErrorCode, findAppError } from './errors.js';

interface HostState {
  failures: number;
  /** `performance.now()` until which requests are refused; 0 when closed. */
  openUntil: number;
  /** A trial request is in flight (half-open). */
  probing: boolean;
}

/** Hosts tracked at most; the oldest entry is dropped beyond that. */
const MAX_HOSTS = 2000;

/** Failures that say "this host is not answering" (never a 4xx/5xx it did answer with). */
const COUNTED: ReadonlySet<string> = new Set([ErrorCode.Timeout, ErrorCode.Unreachable]);

export class CircuitBreaker {
  private readonly hosts = new Map<string, HostState>();
  private opened = 0;

  /**
   * @param threshold - Consecutive failures that open the circuit; `0` disables the breaker.
   * @param cooldownMs - How long an open circuit refuses requests.
   */
  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
  ) {}

  /** `host:port` key of a URL. */
  static keyOf(url: URL): string {
    return url.host.toLowerCase();
  }

  /** Number of times a circuit has opened since boot (for metrics). */
  get openedTotal(): number {
    return this.opened;
  }

  /** Hosts currently short-circuited. */
  openCount(): number {
    const now = performance.now();
    let count = 0;
    for (const state of this.hosts.values()) if (state.openUntil > now) count += 1;
    return count;
  }

  /**
   * Runs `task` against `url`'s host unless its circuit is open.
   *
   * @throws {AppError} `ECIRCUITOPEN` when the host is short-circuited; otherwise whatever `task` throws.
   */
  async run<T>(url: URL, task: () => Promise<T>): Promise<T> {
    if (this.threshold <= 0) return task();
    const key = CircuitBreaker.keyOf(url);
    const state = this.hosts.get(key);
    if (state !== undefined && state.openUntil > 0) {
      const now = performance.now();
      if (state.openUntil > now || state.probing) {
        throw AppError.circuitOpen(url.host, Math.max(1, Math.ceil((state.openUntil - now) / 1000)));
      }
      state.probing = true;
    }
    try {
      const result = await task();
      this.hosts.delete(key);
      return result;
    } catch (error) {
      const code = findAppError(error)?.code;
      if (code !== undefined && COUNTED.has(code)) this.recordFailure(key);
      else if (state?.probing === true) this.hosts.delete(key);
      throw error;
    }
  }

  private recordFailure(key: string): void {
    let state = this.hosts.get(key);
    if (state === undefined) {
      if (this.hosts.size >= MAX_HOSTS) {
        const oldest = this.hosts.keys().next().value;
        if (oldest !== undefined) this.hosts.delete(oldest);
      }
      state = { failures: 0, openUntil: 0, probing: false };
      this.hosts.set(key, state);
    }
    state.failures += 1;
    if (state.probing || state.failures >= this.threshold) {
      state.openUntil = performance.now() + this.cooldownMs;
      state.probing = false;
      this.opened += 1;
    }
  }
}
