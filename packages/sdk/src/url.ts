/**
 * Pure URL construction: no I/O, usable to fill `src` / `href` attributes.
 */
import { OmnillinkError } from './errors.js';

export const API_PREFIX = '/api/v1';

export type Endpoint =
  | 'meta'
  | 'meta/batch'
  | 'screenshot'
  | 'pdf'
  | 'animation'
  | 'extract'
  | 'content'
  | 'tables'
  | 'links'
  | 'html'
  | 'tech'
  | 'insights'
  | 'favicon'
  | 'oembed'
  | 'palette'
  | 'qr'
  | 'og'
  | 'image'
  | 'sitemap'
  | 'check';

/** Strips trailing slashes and a redundant `/api/v1` suffix. */
export function normalizeBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string') {
    throw new TypeError('Omnillink: `baseUrl` must be a string');
  }
  let base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith(API_PREFIX)) base = base.slice(0, -API_PREFIX.length);
  return base;
}

export const invalid = (code: 'EINVALIDURL' | 'EINVALIDPARAMS', message: string): OmnillinkError =>
  new OmnillinkError({ code, status: 0, message });

/**
 * Every query parameter the API knows, all endpoints together. Anything else
 * on an options object (`signal`, `timeoutMs`, a typo from a JavaScript
 * caller) stays out of the URL; which parameter goes with which endpoint is
 * the job of the types.
 */
const PARAMS = new Set(
  (
    'url render embed acceptLanguage userAgent referer force ttl device width height fullPage selector hide ' +
    'hideBanners blockAds waitForSelector click scrollTo waitFor colorScheme frame radius padding background ' +
    'format quality landscape printBackground margin scale pageRanges headerText footerText frames delay fields ' +
    'preset mainContent include exclude citations table scope limit redirect maxWidth maxHeight count size ecc ' +
    'color title description site author label template theme accent'
  ).split(' '),
);

/**
 * Builds `{base}/api/v1/{endpoint}?…` from an object of parameters.
 * `undefined` and `null` values are left out, booleans become `true` /
 * `false`, arrays are comma-joined. `required` names the parameter that must
 * be a non-empty string (`url` everywhere, `title` for `/og`).
 */
export function buildUrl(
  base: string,
  endpoint: Endpoint,
  params: object | undefined,
  required: 'url' | 'title' = 'url',
): string {
  const source = (typeof params === 'object' && params !== null ? params : {}) as Record<string, unknown>;
  const main = source[required];
  if (typeof main !== 'string' || main.trim() === '') {
    throw required === 'url'
      ? invalid('EINVALIDURL', 'The target `url` must be a non-empty string')
      : invalid('EINVALIDPARAMS', '`title` must be a non-empty string');
  }
  const query = new URLSearchParams();
  for (const name of Object.keys(source)) {
    const value = source[name];
    if (value === undefined || value === null || !PARAMS.has(name)) continue;
    query.set(name, Array.isArray(value) ? value.join(',') : String(value));
  }
  return `${base}${API_PREFIX}/${endpoint}?${query.toString()}`;
}

/** Dot path into the metadata that resolves to a URL, e.g. `image.url`. */
export type MetaEmbedPath = 'image.url' | 'favicon' | 'logo.url' | 'video.url' | 'audio.url' | (string & {});
