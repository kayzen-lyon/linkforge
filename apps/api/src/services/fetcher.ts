/**
 * SSRF-safe raw HTTP fetcher (the fast path, no browser involved).
 *
 * - DNS is resolved through a guarded lookup (connection-time pinning).
 * - Redirects are followed manually so that every hop is re-validated.
 * - A global deadline covers connection + headers + body.
 * - The body is capped: metadata lives in `<head>`, there is no reason to
 *   buffer a 2 GB response.
 */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { TLSSocket } from 'node:tls';

import { Agent, fetch, type Response } from 'undici';

import type { AppConfig } from '../config.js';
import { AppError, findAppError, findErrorCode } from '../lib/errors.js';
import { assertSafeUrl, createSafeLookup } from '../security/ssrf.js';

export interface FetchedDocument {
  /** URL after following redirects. */
  readonly finalUrl: string;
  /** HTTP status of the final response. */
  readonly status: number;
  /** Lower-cased media type without parameters, e.g. `text/html`. */
  readonly contentType: string | null;
  /** Decoded body when the response is HTML, `null` otherwise. */
  readonly html: string | null;
}

export interface FetchedBytes {
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string | null;
  /** Response headers, lower-cased names. */
  readonly headers: Readonly<Record<string, string>>;
  /** Names of the cookies the answer sets (values are never kept). */
  readonly cookieNames: readonly string[];
  /** At most `maxBytes` of the (content-decoded) body. */
  readonly body: Buffer;
  /** True when the body was longer than `maxBytes`. */
  readonly truncated: boolean;
}

export interface BytesOptions {
  readonly maxBytes: number;
  readonly accept?: string;
  /** Sent as `Range: bytes=0-<n>`; servers may ignore it, the cap still applies. */
  readonly rangeBytes?: number;
}

export interface ProbeCertificate {
  readonly subject: string | null;
  readonly issuer: string | null;
  readonly validFrom: string;
  readonly validTo: string;
  /** Whole days until expiry (negative once expired). */
  readonly daysLeft: number;
}

export interface ProbeHop {
  readonly url: string;
  readonly status: number;
  readonly durationMs: number;
  /** `Location` of a redirect, resolved; `null` on the last hop. */
  readonly location: string | null;
}

export interface ProbeResult {
  readonly hops: readonly ProbeHop[];
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string | null;
  /** Declared `Content-Length`; `null` when the server does not announce one. */
  readonly contentLength: number | null;
  /** Certificate of the final hop when it is https. */
  readonly certificate: ProbeCertificate | null;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);

/** Extracts the charset from a `Content-Type` header or an early `<meta>` tag. */
function detectCharset(contentTypeHeader: string | null, body: Buffer): string {
  const fromHeader = contentTypeHeader?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  if (fromHeader !== undefined) return fromHeader;
  const head = body.subarray(0, 2048).toString('latin1');
  const fromMeta = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  return fromMeta ?? 'utf-8';
}

function decodeBody(body: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    // Unknown label: fall back to UTF-8 rather than failing the request.
    return new TextDecoder('utf-8').decode(body);
  }
}

/** Reads at most `maxBytes` from a response, then cancels the remainder. */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (response.body === null) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, maxBytes);
}

export class SafeFetcher {
  private readonly agent: Agent;

  constructor(private readonly config: AppConfig) {
    this.agent = new Agent({
      connect: {
        lookup: createSafeLookup(config.ssrf),
        timeout: config.http.timeoutMs,
      },
      headersTimeout: config.http.timeoutMs,
      bodyTimeout: config.http.timeoutMs,
    });
  }

  /**
   * Fetches a document, following redirects safely.
   *
   * HTTP error statuses are **not** thrown: the caller decides whether a 403
   * deserves a browser retry or must be reported.
   *
   * @throws {AppError} `EFORBIDDENURL`, `ETIMEOUT` or `EUNREACHABLE`.
   */
  async fetchDocument(target: URL): Promise<FetchedDocument> {
    const { timeoutMs, maxRedirects, maxBodyBytes, userAgent } = this.config.http;
    const signal = AbortSignal.timeout(timeoutMs);
    let current = target;

    try {
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        current = await assertSafeUrl(current, this.config.ssrf);

        const response = await fetch(current, {
          dispatcher: this.agent,
          redirect: 'manual',
          signal,
          headers: {
            'user-agent': userAgent,
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            'accept-language': 'en;q=0.9,*;q=0.5',
          },
        });

        const location = response.headers.get('location');
        if (REDIRECT_STATUSES.has(response.status) && location !== null) {
          await response.body?.cancel().catch(() => undefined);
          try {
            current = new URL(location, current);
          } catch {
            throw AppError.unreachable('The target sent an invalid redirect location');
          }
          continue;
        }

        const contentTypeHeader = response.headers.get('content-type');
        const contentType = contentTypeHeader?.split(';')[0]?.trim().toLowerCase() ?? null;
        // Servers that omit Content-Type usually serve HTML; sniffing happens downstream.
        const isHtml = contentType === null || HTML_TYPES.has(contentType);

        if (!isHtml) {
          await response.body?.cancel().catch(() => undefined);
          return { finalUrl: current.href, status: response.status, contentType, html: null };
        }

        const body = await readCapped(response, maxBodyBytes);
        return {
          finalUrl: current.href,
          status: response.status,
          contentType,
          html: decodeBody(body, detectCharset(contentTypeHeader, body)),
        };
      }
      throw AppError.unreachable(`Too many redirects (more than ${maxRedirects})`);
    } catch (error) {
      throw this.normalizeError(error, current);
    }
  }

  /**
   * Fetches raw bytes of any content type (sitemaps, image headers, JSON),
   * with the same guarantees as {@link fetchDocument}: guarded DNS, every
   * redirect re-validated, global deadline, capped body.
   *
   * @throws {AppError} `EFORBIDDENURL`, `ETIMEOUT` or `EUNREACHABLE`.
   */
  async fetchBytes(target: URL, options: BytesOptions): Promise<FetchedBytes> {
    const { timeoutMs, maxRedirects, userAgent } = this.config.http;
    const signal = AbortSignal.timeout(timeoutMs);
    let current = target;
    try {
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        current = await assertSafeUrl(current, this.config.ssrf);
        const response = await fetch(current, {
          dispatcher: this.agent,
          redirect: 'manual',
          signal,
          headers: {
            'user-agent': userAgent,
            accept: options.accept ?? '*/*',
            ...(options.rangeBytes !== undefined && { range: `bytes=0-${options.rangeBytes - 1}` }),
          },
        });
        const location = response.headers.get('location');
        if (REDIRECT_STATUSES.has(response.status) && location !== null) {
          await response.body?.cancel().catch(() => undefined);
          if (!URL.canParse(location, current.href)) {
            throw AppError.unreachable('The target sent an invalid redirect location');
          }
          current = new URL(location, current);
          continue;
        }
        // One byte more than the cap tells a full body from a truncated one.
        const read = await readCapped(response, options.maxBytes + 1);
        return {
          finalUrl: current.href,
          status: response.status,
          contentType:
            response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? null,
          headers: Object.fromEntries(
            [...response.headers.entries()].filter(([name]) => name !== 'set-cookie'),
          ),
          cookieNames: response.headers
            .getSetCookie()
            .map((cookie) => cookie.split('=')[0]?.trim() ?? '')
            .filter((name) => name !== ''),
          body: read.subarray(0, options.maxBytes),
          truncated: read.byteLength > options.maxBytes,
        };
      }
      throw AppError.unreachable(`Too many redirects (more than ${maxRedirects})`);
    } catch (error) {
      throw this.normalizeError(error, current);
    }
  }

  /**
   * Follows a URL hop by hop and reports what each hop answered, how long it
   * took and, for https, the certificate presented. Bodies are never read.
   * Every hop is validated and its connection goes through the guarded lookup.
   *
   * @throws {AppError} `EFORBIDDENURL`, `ETIMEOUT` or `EUNREACHABLE`.
   */
  async probe(target: URL): Promise<ProbeResult> {
    const { timeoutMs, maxRedirects, userAgent } = this.config.http;
    const deadline = performance.now() + timeoutMs;
    const lookup = createSafeLookup(this.config.ssrf);
    const hops: ProbeHop[] = [];
    let current = target;

    try {
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        current = await assertSafeUrl(current, this.config.ssrf);
        const url = current;
        const startedAt = performance.now();
        const answer = await new Promise<{
          status: number;
          headers: Record<string, string | string[] | undefined>;
          certificate: ProbeCertificate | null;
        }>((resolve, reject) => {
          const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
          const request = send(
            url,
            {
              method: 'GET',
              lookup,
              agent: false,
              timeout: Math.max(1, deadline - performance.now()),
              headers: { 'user-agent': userAgent, accept: '*/*' },
            },
            (response) => {
              const peer =
                url.protocol === 'https:'
                  ? (response.socket as TLSSocket).getPeerCertificate()
                  : null;
              const validTo = peer?.valid_to === undefined ? null : new Date(peer.valid_to);
              resolve({
                status: response.statusCode ?? 0,
                headers: response.headers,
                certificate:
                  peer === null || validTo === null || Number.isNaN(validTo.getTime())
                    ? null
                    : {
                        subject: [peer.subject?.CN ?? []].flat()[0] ?? null,
                        issuer: [peer.issuer?.O ?? peer.issuer?.CN ?? []].flat()[0] ?? null,
                        validFrom: new Date(peer.valid_from).toISOString(),
                        validTo: validTo.toISOString(),
                        daysLeft: Math.floor((validTo.getTime() - Date.now()) / 86_400_000),
                      },
              });
              // Headers are all we need: drop the connection, never read the body.
              response.destroy();
            },
          );
          request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
          request.on('error', reject);
          request.end();
        });

        const header = (name: string): string | null => {
          const value = answer.headers[name];
          return typeof value === 'string' ? value : (value?.[0] ?? null);
        };
        const rawLocation = header('location');
        const redirect =
          REDIRECT_STATUSES.has(answer.status) && rawLocation !== null && URL.canParse(rawLocation, url.href)
            ? new URL(rawLocation, url)
            : null;
        hops.push({
          url: url.href,
          status: answer.status,
          durationMs: Math.round(performance.now() - startedAt),
          location: redirect?.href ?? null,
        });
        if (redirect !== null) {
          current = redirect;
          continue;
        }
        const length = Number(header('content-length') ?? NaN);
        return {
          hops,
          finalUrl: url.href,
          status: answer.status,
          contentType: header('content-type')?.split(';')[0]?.trim().toLowerCase() ?? null,
          contentLength: Number.isFinite(length) ? length : null,
          certificate: answer.certificate,
        };
      }
      throw AppError.unreachable(`Too many redirects (more than ${maxRedirects})`);
    } catch (error) {
      throw this.normalizeError(error, current);
    }
  }

  /** Closes pooled sockets. */
  async close(): Promise<void> {
    await this.agent.close();
  }

  /** Maps low-level network failures to domain errors. */
  private normalizeError(error: unknown, url: URL): AppError {
    const appError = findAppError(error);
    if (appError !== undefined) return appError;

    const name = error instanceof Error ? error.name : '';
    const code = findErrorCode(error) ?? '';

    if (name === 'TimeoutError' || name === 'AbortError' || code.includes('TIMEOUT')) {
      return AppError.timeout(
        `The target did not respond within ${this.config.http.timeoutMs} ms`,
        error,
      );
    }
    return AppError.unreachable(
      `Could not reach ${url.host}${code === '' ? '' : ` (${code})`}`,
      error,
    );
  }
}
