/**
 * API-key verification.
 *
 * Keys are compared as SHA-256 digests with `timingSafeEqual`, and every
 * configured key is always checked: the time taken reveals neither how many
 * leading characters matched nor which key did.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

export class ApiKeyRegistry {
  private readonly digests: readonly Buffer[];

  /** @param keys - Accepted keys; an empty list turns the feature off. */
  constructor(keys: readonly string[]) {
    this.digests = keys.map(digest);
  }

  /** False when no key is configured: `x-api-key` is then ignored altogether. */
  get enabled(): boolean {
    return this.digests.length > 0;
  }

  /**
   * Checks a presented key.
   *
   * @returns A stable, non-secret identifier for the key (safe to use as a
   *   rate-limit bucket or in logs), or `null` when the key is unknown.
   */
  identify(presented: string): string | null {
    const candidate = digest(presented);
    let match: Buffer | null = null;
    // No early exit: the loop length must not depend on which key matched.
    for (const known of this.digests) {
      if (timingSafeEqual(known, candidate)) match = known;
    }
    return match === null ? null : `key:${match.toString('hex').slice(0, 32)}`;
  }
}
