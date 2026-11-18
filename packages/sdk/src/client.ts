import { LinkForgeError } from './errors.js';
import type {
  ClientOptions,
  ContentOptions,
  ExtractData,
  ExtractFields,
  ExtractOptions,
  LinkForgeResult,
  LinkMetadata,
  MetaOptions,
  PdfOptions,
  ReadableContent,
  RequestOptions,
  ResponseMeta,
  ScreenshotOptions,
} from './types.js';
import {
  buildUrl,
  extractParams,
  metaParams,
  normalizeBaseUrl,
  pdfParams,
  screenshotParams,
  type MetaEmbedPath,
} from './url.js';

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface LinkForgeClient {
  /** Rich metadata of a page. */
  meta(url: string, options?: MetaOptions & RequestOptions): Promise<LinkForgeResult<LinkMetadata>>;
  /** Custom scraping: one CSS rule per field. The result is typed after the rules. */
  extract<const F extends ExtractFields>(
    url: string,
    fields: F,
    options?: ExtractOptions & RequestOptions,
  ): Promise<LinkForgeResult<ExtractData<F>>>;
  /** Readable content of a page, as text and Markdown. */
  content(url: string, options?: ContentOptions & RequestOptions): Promise<LinkForgeResult<ReadableContent>>;
  /** Screenshot of a page, as a `Blob` whose `type` is `image/png` or `image/jpeg`. */
  screenshot(url: string, options?: ScreenshotOptions & RequestOptions): Promise<Blob>;
  /** PDF of a page, as a `Blob` of type `application/pdf`. */
  pdf(url: string, options?: PdfOptions & RequestOptions): Promise<Blob>;

  /** URL of the screenshot endpoint, for an `<img src>`. No request is made. */
  screenshotUrl(url: string, options?: ScreenshotOptions): string;
  /** URL of the PDF endpoint, for an `<a href>`. No request is made. */
  pdfUrl(url: string, options?: PdfOptions): string;
  /**
   * URL that redirects to one value of the metadata, e.g. `image.url` for the
   * preview image. No request is made.
   */
  metaEmbedUrl(url: string, path: MetaEmbedPath, options?: MetaOptions): string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAbortError = (error: unknown): boolean =>
  isRecord(error) && (error['name'] === 'AbortError' || error['name'] === 'TimeoutError');

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const raw = response.headers?.get('retry-after');
  if (raw === null || raw === undefined || raw.trim() === '') return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.round((date - Date.now()) / 1000));
}

/** Turns a non-2xx response into the error to throw. */
async function errorFromResponse(response: Response): Promise<LinkForgeError> {
  const body = parseJson(await response.text());
  const retryAfter = parseRetryAfter(response);
  if (isRecord(body) && typeof body['code'] === 'string' && body['code'] !== '') {
    const message = body['message'];
    return new LinkForgeError({
      code: body['code'],
      status: response.status,
      message: typeof message === 'string' && message !== '' ? message : `Request failed (${body['code']})`,
      ...(retryAfter === undefined ? {} : { retryAfter }),
    });
  }
  const reason = response.statusText ? ` ${response.statusText}` : '';
  return new LinkForgeError({
    code: 'EHTTP',
    status: response.status,
    message: `Request failed with HTTP ${response.status}${reason}`,
    ...(retryAfter === undefined ? {} : { retryAfter }),
  });
}

/**
 * Creates a client bound to one LinkForge instance.
 *
 * @example
 * const linkforge = createClient({ baseUrl: 'https://links.example.com' });
 * const { data } = await linkforge.meta('https://github.com');
 */
export function createClient(options: ClientOptions): LinkForgeClient {
  if (!isRecord(options)) {
    throw new TypeError('LinkForge: createClient() expects an options object with `baseUrl`');
  }
  const base = normalizeBaseUrl(options.baseUrl);
  const { apiKey, fetch: customFetch } = options;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** Runs one GET and hands the 2xx response to `read`, all under one timeout. */
  async function request<T>(
    endpoint: string,
    kind: 'json' | 'binary',
    requestOptions: RequestOptions | undefined,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    // Resolved per call so a polyfill installed after createClient() is picked up;
    // called unbound-safe because browsers reject a detached `fetch`.
    const doFetch = customFetch ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init));
    if (customFetch === undefined && typeof globalThis.fetch !== 'function') {
      throw new LinkForgeError({
        code: 'ENETWORK',
        status: 0,
        message: 'No global fetch: pass a `fetch` implementation to createClient()',
      });
    }

    const userSignal = requestOptions?.signal;
    const timeoutMs = requestOptions?.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    let timedOut = false;

    const abortedError = (cause?: unknown): LinkForgeError =>
      new LinkForgeError({ code: 'EABORTED', status: 0, message: 'The request was aborted', cause });

    if (userSignal?.aborted) throw abortedError(userSignal.reason);
    const onUserAbort = (): void => controller.abort();
    userSignal?.addEventListener('abort', onUserAbort, { once: true });
    const timer =
      timeoutMs > 0 && Number.isFinite(timeoutMs)
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;

    const headers: Record<string, string> = {};
    if (kind === 'json') headers['accept'] = 'application/json';
    if (apiKey !== undefined && apiKey !== '') headers['x-api-key'] = apiKey;

    try {
      const response = await doFetch(endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) throw await errorFromResponse(response);
      return await read(response);
    } catch (error) {
      if (timedOut) {
        throw new LinkForgeError({
          code: 'ETIMEOUT',
          status: 0,
          message: `No complete response within ${timeoutMs} ms`,
          cause: error,
        });
      }
      if (userSignal?.aborted) throw abortedError(error);
      if (error instanceof LinkForgeError) throw error;
      throw new LinkForgeError({
        code: isAbortError(error) ? 'EABORTED' : 'ENETWORK',
        status: 0,
        message: `Network request failed: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      userSignal?.removeEventListener('abort', onUserAbort);
    }
  }

  const json = <T>(endpoint: string, requestOptions?: RequestOptions): Promise<LinkForgeResult<T>> =>
    request(endpoint, 'json', requestOptions, async (response) => {
      const body = parseJson(await response.text());
      if (isRecord(body) && body['status'] === 'success' && 'data' in body) {
        return { data: body['data'] as T, meta: body['meta'] as ResponseMeta };
      }
      // A 2xx carrying an error envelope is still an API error.
      if (isRecord(body) && typeof body['code'] === 'string' && typeof body['message'] === 'string') {
        throw new LinkForgeError({ code: body['code'], status: response.status, message: body['message'] });
      }
      throw new LinkForgeError({
        code: 'EBADRESPONSE',
        status: response.status,
        message: 'The server answered with something that is not a LinkForge response',
      });
    });

  const binary = (endpoint: string, requestOptions?: RequestOptions): Promise<Blob> =>
    request(endpoint, 'binary', requestOptions, (response) => response.blob());

  return {
    meta: async (url, opts) => json(buildUrl(base, 'meta', url, metaParams(opts)), opts),
    extract: async (url, fields, opts) =>
      json(buildUrl(base, 'extract', url, extractParams(fields, opts)), opts),
    content: async (url, opts) =>
      json(buildUrl(base, 'content', url, { render: opts?.render }), opts),
    screenshot: async (url, opts) => binary(buildUrl(base, 'screenshot', url, screenshotParams(opts)), opts),
    pdf: async (url, opts) => binary(buildUrl(base, 'pdf', url, pdfParams(opts)), opts),

    screenshotUrl: (url, opts) => buildUrl(base, 'screenshot', url, screenshotParams(opts)),
    pdfUrl: (url, opts) => buildUrl(base, 'pdf', url, pdfParams(opts)),
    metaEmbedUrl: (url, path, opts) => {
      if (typeof path !== 'string' || path === '') {
        throw new LinkForgeError({
          code: 'EINVALIDPARAMS',
          status: 0,
          message: '`path` must be a dot path into the metadata, e.g. "image.url"',
        });
      }
      return buildUrl(base, 'meta', url, { ...metaParams(opts), embed: path });
    },
  };
}
