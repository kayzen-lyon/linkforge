/**
 * SSRF-safe raw HTTP fetcher (the fast path, no browser involved).
 *
 * - DNS is resolved through a guarded lookup (connection-time pinning).
 * - Redirects are followed manually so that every hop is re-validated.
 * - A global deadline covers connection + headers + body.
 * - The body is capped: metadata lives in `<head>`, there is no reason to
 *   buffer a 2 GB response.
 */
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
