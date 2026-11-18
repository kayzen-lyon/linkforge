/**
 * Pure URL construction: no I/O, usable to fill `src` / `href` attributes.
 */
import { OmnillinkError } from './errors.js';
import type { ExtractFields, MetaOptions, PdfOptions, ScreenshotOptions } from './types.js';

export const API_PREFIX = '/api/v1';

export type Endpoint = 'meta' | 'screenshot' | 'pdf' | 'extract' | 'content';

type ParamValue = string | number | boolean | readonly string[] | null | undefined;
export type Params = Readonly<Record<string, ParamValue>>;

/** Strips trailing slashes and a redundant `/api/v1` suffix. */
export function normalizeBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string') {
    throw new TypeError('Omnillink: `baseUrl` must be a string');
  }
  let base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith(API_PREFIX)) base = base.slice(0, -API_PREFIX.length);
  return base;
}

function assertTargetUrl(url: unknown): asserts url is string {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new OmnillinkError({
      code: 'EINVALIDURL',
      status: 0,
      message: 'The target `url` must be a non-empty string',
    });
  }
}

/**
 * Builds `{base}/api/v1/{endpoint}?url=…&…`. `undefined` and `null` values are
 * left out, booleans become `true` / `false`, arrays are comma-joined.
 */
export function buildUrl(base: string, endpoint: Endpoint, url: string, params: Params = {}): string {
  assertTargetUrl(url);
  const query = new URLSearchParams({ url });
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.set(name, Array.isArray(value) ? value.join(',') : String(value));
  }
  return `${base}${API_PREFIX}/${endpoint}?${query.toString()}`;
}

// Each endpoint lists the parameters it forwards: anything else on the options
// object (`signal`, `timeoutMs`, a typo from a JavaScript caller) stays out of the URL.

const pick = <T extends object>(options: T | undefined, keys: readonly (keyof T & string)[]): Params => {
  const picked: Record<string, ParamValue> = {};
  if (options !== undefined && options !== null) {
    for (const key of keys) picked[key] = options[key] as ParamValue;
  }
  return picked;
};

export const metaParams = (options?: MetaOptions): Params =>
  pick(options, ['render', 'force', 'ttl']);

export const screenshotParams = (options?: ScreenshotOptions): Params =>
  pick(options, [
    'device',
    'fullPage',
    'format',
    'quality',
    'width',
    'height',
    'selector',
    'waitFor',
    'colorScheme',
    'hide',
    'force',
    'ttl',
  ]);

export const pdfParams = (options?: PdfOptions): Params =>
  pick(options, ['format', 'landscape', 'printBackground', 'force', 'ttl']);

export const extractParams = (fields: ExtractFields, options?: { render?: string }): Params => {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    throw new OmnillinkError({
      code: 'EINVALIDPARAMS',
      status: 0,
      message: '`fields` must be an object of extraction rules',
    });
  }
  return { fields: JSON.stringify(fields), ...pick(options, ['render']) };
};

/** Dot path into the metadata that resolves to a URL, e.g. `image.url`. */
export type MetaEmbedPath = 'image.url' | 'favicon' | 'logo.url' | 'video.url' | 'audio.url' | (string & {});
