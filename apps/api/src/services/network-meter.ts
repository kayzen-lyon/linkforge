/**
 * What one rendered page pulled from the network, and how much it may pull.
 *
 * Two jobs share the same bookkeeping: bounding a page (requests and bytes are
 * capped; past a cap, further requests are dropped and loading stops, and the
 * page is used as it is), and reporting its weight (`/insights`).
 * Byte counts are the encoded sizes Chromium reports over the DevTools
 * protocol: what travelled on the wire, headers included.
 */
import type { CDPSession } from 'playwright-core';

export type ResourceKind = 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'xhr' | 'other';

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  'document', 'script', 'stylesheet', 'image', 'font', 'media', 'xhr', 'other',
];

const KIND_OF: Readonly<Record<string, ResourceKind>> = {
  Document: 'document', Script: 'script', Stylesheet: 'stylesheet', Image: 'image', Font: 'font',
  Media: 'media', XHR: 'xhr', Fetch: 'xhr', EventSource: 'xhr',
};

interface Entry {
  readonly kind: ResourceKind;
  readonly host: string;
  bytes: number;
  responded: boolean;
}

export interface NetworkSummary {
  /** Requests that got a response. */
  readonly requests: number;
  /** Encoded bytes received, headers included. */
  readonly transferBytes: number;
  readonly byType: Readonly<Record<ResourceKind, { requests: number; transferBytes: number }>>;
  /** Distinct hosts that are not the page's own site. */
  readonly thirdPartyHosts: readonly string[];
  readonly thirdPartyRequests: number;
  readonly thirdPartyBytes: number;
  /** Which per-page cap stopped the load, if any. */
  readonly limitReached: 'requests' | 'bytes' | null;
}

/** Last two labels of a host: a cheap "same site" test (`cdn.example.com` ~ `www.example.com`). */
function siteOf(host: string): string {
  const labels = host.split('.');
  // Without a public-suffix list, `a.co.uk` and `b.co.uk` would look alike: keep three labels there.
  const short = (labels.at(-1) ?? '').length === 2 && (labels.at(-2) ?? '').length <= 3;
  return labels.slice(short ? -3 : -2).join('.');
}

export class NetworkMeter {
  private readonly entries = new Map<string, Entry>();
  private admitted = 0;
  private received = 0;
  private stopped: 'requests' | 'bytes' | null = null;

  constructor(
    private readonly maxRequests: number,
    private readonly maxBytes: number,
  ) {}

  /** The cap that was hit, or `null` while the page is within its budget. */
  get limitReached(): 'requests' | 'bytes' | null {
    return this.stopped;
  }

  /** Called for every request the page wants to send; `false` means "drop it". */
  admit(): boolean {
    if (this.stopped !== null) return false;
    this.admitted += 1;
    if (this.admitted > this.maxRequests) {
      this.stopped = 'requests';
      return false;
    }
    return true;
  }

  /**
   * Starts counting on a DevTools session of the page.
   *
   * @param onLimit - Called once, when the byte budget is exhausted.
   */
  async attach(session: CDPSession, onLimit: () => void): Promise<void> {
    session.on('Network.requestWillBeSent', (event) => {
      if (this.entries.size >= this.maxRequests * 2 || !/^https?:/i.test(event.request.url)) return;
      let host = '';
      try {
        host = new URL(event.request.url).hostname.toLowerCase();
      } catch {
        return;
      }
      // A redirect re-uses the request id: the entry then describes the last hop.
      const previous = this.entries.get(event.requestId);
      this.entries.set(event.requestId, {
        kind: KIND_OF[event.type ?? ''] ?? 'other',
        host,
        bytes: previous?.bytes ?? 0,
        responded: false,
      });
    });
    session.on('Network.responseReceived', (event) => {
      const entry = this.entries.get(event.requestId);
      if (entry !== undefined) entry.responded = true;
    });
    const add = (requestId: string, bytes: number): void => {
      if (!(bytes > 0)) return;
      const entry = this.entries.get(requestId);
      if (entry !== undefined) entry.bytes += bytes;
      this.received += bytes;
      if (this.received > this.maxBytes && this.stopped === null) {
        this.stopped = 'bytes';
        onLimit();
      }
    };
    session.on('Network.dataReceived', (event) => add(event.requestId, event.encodedDataLength));
    session.on('Network.loadingFinished', (event) => {
      // The final figure includes response headers; top up what the chunks missed.
      const entry = this.entries.get(event.requestId);
      if (entry !== undefined) add(event.requestId, event.encodedDataLength - entry.bytes);
    });
    await session.send('Network.enable');
  }

  /** Totals of everything that got a response so far. */
  summary(pageUrl: string): NetworkSummary {
    let pageSite = '';
    try {
      pageSite = siteOf(new URL(pageUrl).hostname.toLowerCase());
    } catch {
      // Not a URL: every host counts as third-party.
    }
    const byType = Object.fromEntries(
      RESOURCE_KINDS.map((kind) => [kind, { requests: 0, transferBytes: 0 }]),
    ) as Record<ResourceKind, { requests: number; transferBytes: number }>;
    const thirdParty = new Set<string>();
    let requests = 0;
    let transferBytes = 0;
    let thirdPartyRequests = 0;
    let thirdPartyBytes = 0;
    for (const entry of this.entries.values()) {
      if (!entry.responded) continue;
      requests += 1;
      transferBytes += entry.bytes;
      byType[entry.kind].requests += 1;
      byType[entry.kind].transferBytes += entry.bytes;
      if (siteOf(entry.host) !== pageSite) {
        thirdParty.add(entry.host);
        thirdPartyRequests += 1;
        thirdPartyBytes += entry.bytes;
      }
    }
    return {
      requests,
      transferBytes,
      byType,
      thirdPartyHosts: [...thirdParty].sort().slice(0, 100),
      thirdPartyRequests,
      thirdPartyBytes,
      limitReached: this.stopped,
    };
  }
}
