/**
 * One time budget per request.
 *
 * The platform kills a function at its hard limit with a non-JSON 504; every
 * step (slot acquisition, browser launch, navigation, settle, capture) is
 * therefore sized from what is left of a single deadline, so the API always
 * answers by itself, with its own error body, before that limit.
 */
export class Deadline {
  private readonly endsAt: number;

  /** @param totalMs - Budget of the whole request, in milliseconds. */
  constructor(readonly totalMs: number) {
    this.endsAt = performance.now() + totalMs;
  }

  /** Milliseconds left, never negative. */
  remaining(): number {
    return Math.max(0, this.endsAt - performance.now());
  }

  /**
   * Time a step may take: at most `wantedMs`, and never so much that less
   * than `reserveMs` would be left for the steps that follow.
   */
  budget(wantedMs: number, reserveMs = 0): number {
    return Math.max(0, Math.min(wantedMs, this.remaining() - reserveMs));
  }
}
