/**
 * Request headers a caller may set on the request to the target.
 *
 * Strictly three: `Accept-Language`, `User-Agent` and `Referer`. Credentials
 * (`Cookie`, `Authorization`) are refused by design: answers are cached by URL
 * on the server and by any CDN in front of it (`s-maxage`), so a page fetched
 * with one caller's session would be served to the next caller. The three
 * accepted headers change what a site answers without identifying anyone, and
 * they are part of every cache key.
 */
import { AppError } from './errors.js';

export interface TargetHeaders {
  readonly acceptLanguage: string | null;
  readonly userAgent: string | null;
  readonly referer: string | null;
}

export const TARGET_HEADER_LIMITS = { acceptLanguage: 200, userAgent: 300, referer: 2048 } as const;

const LANGUAGE_RANGE = String.raw`(?:\*|[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8}){0,3})(?:;q=(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?))?`;
const ACCEPT_LANGUAGE = new RegExp(String.raw`^${LANGUAGE_RANGE}(?:\s*,\s*${LANGUAGE_RANGE}){0,9}$`);
/** Printable ASCII only: no control character can split the header. */
const USER_AGENT = /^[\x20-\x7e]+$/;

/**
 * Validates the three optional header parameters.
 *
 * @returns `null` when none is set, so callers keep the default behaviour and
 *   the default cache key.
 * @throws {AppError} `EINVALIDPARAMS`.
 */
export function parseTargetHeaders(raw: {
  readonly acceptLanguage?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly referer?: string | undefined;
}): TargetHeaders | null {
  const acceptLanguage = raw.acceptLanguage?.trim() ?? null;
  const userAgent = raw.userAgent?.trim() ?? null;
  let referer: string | null = null;

  if (acceptLanguage !== null) {
    if (acceptLanguage.length > TARGET_HEADER_LIMITS.acceptLanguage || !ACCEPT_LANGUAGE.test(acceptLanguage)) {
      throw AppError.invalidParams('acceptLanguage: expected language ranges such as `fr-FR,fr;q=0.9,en;q=0.5`');
    }
  }
  if (userAgent !== null) {
    if (userAgent === '' || userAgent.length > TARGET_HEADER_LIMITS.userAgent || !USER_AGENT.test(userAgent)) {
      throw AppError.invalidParams('userAgent: 1 to 300 printable ASCII characters');
    }
  }
  if (raw.referer !== undefined) {
    let url: URL;
    try {
      url = new URL(raw.referer.trim());
    } catch {
      throw AppError.invalidParams('referer: must be an absolute http(s) URL');
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '') {
      throw AppError.invalidParams('referer: must be an absolute http(s) URL without credentials');
    }
    url.hash = '';
    if (url.href.length > TARGET_HEADER_LIMITS.referer) throw AppError.invalidParams('referer: too long');
    referer = url.href;
  }
  if (acceptLanguage === null && userAgent === null && referer === null) return null;
  return { acceptLanguage, userAgent, referer };
}

/** The headers as sent on the raw HTTP path (lower-cased names, only those set). */
export function toHttpHeaders(headers: TargetHeaders | null | undefined): Record<string, string> {
  if (headers === null || headers === undefined) return {};
  return {
    ...(headers.acceptLanguage !== null && { 'accept-language': headers.acceptLanguage }),
    ...(headers.userAgent !== null && { 'user-agent': headers.userAgent }),
    ...(headers.referer !== null && { referer: headers.referer }),
  };
}
