import { OmnillinkError } from './errors.js';
import type {
  AnimationOptions,
  CheckMeta,
  ClientOptions,
  Conditional,
  ContentOptions,
  ContentTextOptions,
  ExtractData,
  ExtractFields,
  ExtractOptions,
  ExtractPreset,
  FaviconData,
  FaviconOptions,
  HtmlOptions,
  ImageData,
  ImageOptions,
  InsightsData,
  InsightsOptions,
  LinkCheck,
  LinkMetadata,
  LinksData,
  LinksOptions,
  MaybeNotModified,
  MetaBatchItem,
  MetaBatchMeta,
  MetaBatchOptions,
  MetaOptions,
  NotModified,
  OembedData,
  OembedOptions,
  OgOptions,
  OmnillinkResult,
  OmnillinkText,
  PaletteData,
  PaletteOptions,
  PdfOptions,
  PresetData,
  QrOptions,
  ReadableContent,
  RequestOptions,
  ResponseInfo,
  ScreenshotOptions,
  SitemapData,
  SitemapOptions,
  TablesCsvOptions,
  TablesData,
  TablesOptions,
  TechData,
  TechOptions,
} from './types.js';
import { buildUrl, invalid, normalizeBaseUrl, type Endpoint, type MetaEmbedPath } from './url.js';

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Options of a JSON or text method: the endpoint's own, plus the request's and `ifNoneMatch`. */
type Req<O> = Conditional<O & RequestOptions>;
type Json<T, O> = Promise<MaybeNotModified<OmnillinkResult<T>, O>>;
type Text<O> = Promise<MaybeNotModified<OmnillinkText, O>>;

export interface OmnillinkClient {
  // ---- JSON ------------------------------------------------------------------

  /** Rich metadata of a page. */
  meta<O extends Req<MetaOptions> = {}>(url: string, options?: O): Json<LinkMetadata, O>;
  /**
   * Metadata of up to 10 URLs in one call, over raw HTTP only (no browser).
   * One item per URL, in input order; a URL that fails is an item with a
   * `code`, never a thrown error.
   */
  metaBatch(
    urls: readonly string[],
    options?: MetaBatchOptions & RequestOptions,
  ): Promise<OmnillinkResult<readonly MetaBatchItem[], MetaBatchMeta>>;
  /** Custom scraping: one CSS rule per field. The result is typed after the rules. */
  extract<const F extends ExtractFields, O extends Req<ExtractOptions> = {}>(
    url: string,
    fields: F,
    options?: O,
  ): Json<ExtractData<F>, O>;
  /**
   * Built-in typed fields of an article, a product, a recipe or an event, read
   * from what the page declares. The result is typed after the preset.
   */
  extractPreset<P extends ExtractPreset, O extends Req<ExtractOptions> = {}>(
    url: string,
    preset: P,
    options?: O,
  ): Json<PresetData<P>, O>;
  /** Readable content of a page, as text and Markdown, with its links and images. */
  content<O extends Req<ContentOptions> = {}>(url: string, options?: O): Json<ReadableContent, O>;
  /** Data tables of a page: headers detected, spans expanded. */
  tables<O extends Req<TablesOptions> = {}>(url: string, options?: O): Json<TablesData, O>;
  /** Every `<a href>` of a page: absolute, de-duplicated, in document order. */
  links<O extends Req<LinksOptions> = {}>(url: string, options?: O): Json<LinksData, O>;
  /** Technologies recognised on a page, each with its evidence and a confidence level. */
  tech<O extends Req<TechOptions> = {}>(url: string, options?: O): Json<TechData, O>;
  /** What one load of the page costs: weight, requests, timings, web vitals (lab measurements). */
  insights<O extends Req<InsightsOptions> = {}>(url: string, options?: O): Json<InsightsData, O>;
  /** Real format, dimensions and weight of an image, or of a page's main preview image. */
  image<O extends Req<ImageOptions> = {}>(url: string, options?: O): Json<ImageData, O>;
  /** Dominant colours of an image, or of a page's main preview image. */
  palette<O extends Req<PaletteOptions> = {}>(url: string, options?: O): Json<PaletteData, O>;
  /** Best icon of a site, with its real dimensions. */
  favicon<O extends Req<FaviconOptions> = {}>(url: string, options?: O): Json<FaviconData, O>;
  /** oEmbed document advertised by a page. `data.html` is untrusted third-party markup. */
  oembed<O extends Req<OembedOptions> = {}>(url: string, options?: O): Json<OembedData, O>;
  /** robots.txt and sitemaps of a site, with the URLs they list. */
  sitemap<O extends Req<SitemapOptions> = {}>(url: string, options?: O): Json<SitemapData, O>;
  /**
   * State of a link right now: final status, redirect chain, TLS certificate.
   * Never cached. An HTTP error of the target is a result (`data.ok === false`).
   */
  check(url: string, options?: RequestOptions): Promise<OmnillinkResult<LinkCheck, CheckMeta>>;

  // ---- text ------------------------------------------------------------------

  /**
   * HTML of a page once rendered by a browser, as a string. Third-party
   * markup: treat it as untrusted input. `response.finalUrl` is the URL after redirects.
   */
  html<O extends Req<HtmlOptions> = {}>(url: string, options?: O): Text<O>;
  /** Readable content alone, as Markdown (default) or plain text: ready for a prompt. */
  contentText<O extends Req<ContentTextOptions> = {}>(url: string, options?: O): Text<O>;
  /** One table of a page as RFC 4180 CSV (formula-like cells are neutralised). */
  tablesCsv<O extends Req<TablesCsvOptions> = {}>(url: string, options?: O): Text<O>;

  // ---- binary ----------------------------------------------------------------

  /** Screenshot of a page, as a `Blob` whose `type` is `image/png` or `image/jpeg`. */
  screenshot(url: string, options?: ScreenshotOptions & RequestOptions): Promise<Blob>;
  /** PDF of a page, as a `Blob` of type `application/pdf`. */
  pdf(url: string, options?: PdfOptions & RequestOptions): Promise<Blob>;
  /** Animated scroll-through of a page, as a `Blob` of type `image/apng`. */
  animation(url: string, options?: AnimationOptions & RequestOptions): Promise<Blob>;
  /** QR code of a URL (encoded, never fetched), as a `Blob`: `image/svg+xml` by default, or `image/png`. */
  qr(url: string, options?: QrOptions & RequestOptions): Promise<Blob>;
  /** 1200×630 social card built from text, as a `Blob` (`image/png` or `image/jpeg`). */
  og(params: OgOptions & RequestOptions): Promise<Blob>;

  // ---- URL builders: no request is made, the API key is never in the URL -------

  /** URL of the screenshot endpoint, for an `<img src>`. */
  screenshotUrl(url: string, options?: ScreenshotOptions): string;
  /** URL of the PDF endpoint, for an `<a href>`. */
  pdfUrl(url: string, options?: PdfOptions): string;
  /** URL of the animated capture, for an `<img src>`. */
  animationUrl(url: string, options?: AnimationOptions): string;
  /** URL of the QR code of `url`, for an `<img src>`. */
  qrUrl(url: string, options?: QrOptions): string;
  /** URL of a social card, for `<meta property="og:image">`. */
  ogUrl(params: OgOptions): string;
  /** URL that redirects to the best icon of a site, for an `<img src>`. */
  faviconUrl(url: string, options?: FaviconOptions): string;
  /**
   * URL that redirects to one value of the metadata, e.g. `image.url` for the
   * preview image.
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

const header = (response: Response, name: string): string | null => response.headers?.get(name) ?? null;

function numberHeader(response: Response, name: string): number | null {
  const raw = header(response, name);
  const value = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseRetryAfter(response: Response): number | undefined {
  const raw = header(response, 'retry-after');
  if (raw === null || raw.trim() === '') return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.round((date - Date.now()) / 1000));
}

function readInfo(response: Response): ResponseInfo {
  const cache = header(response, 'x-cache');
  const source = header(response, 'x-render-source');
  const limit = numberHeader(response, 'x-ratelimit-limit');
  const remaining = numberHeader(response, 'x-ratelimit-remaining');
  const reset = numberHeader(response, 'x-ratelimit-reset');
  return {
    status: response.status,
    cache: cache === 'HIT' || cache === 'MISS' ? cache : null,
    renderSource: source === 'http' || source === 'browser' ? source : null,
    requestId: header(response, 'x-request-id'),
    etag: header(response, 'etag'),
    rateLimit: limit === null && remaining === null && reset === null ? null : { limit, remaining, reset },
    finalUrl: header(response, 'x-final-url'),
    animationFrames: numberHeader(response, 'x-animation-frames'),
    qrVersion: numberHeader(response, 'x-qr-version'),
  };
}

const infos = new WeakMap<object, ResponseInfo>();

/**
 * Response headers of anything the client resolved to: cache state, request
 * id, quota, `etag`… For JSON and text results this is their `response`
 * property; for a `Blob` it is the only way to reach them.
 */
export function responseInfo(result: Blob | { readonly response?: ResponseInfo }): ResponseInfo | undefined {
  return infos.get(result) ?? (result as { response?: ResponseInfo }).response;
}

/** Turns a non-2xx response into the error to throw. */
async function errorFromResponse(response: Response): Promise<OmnillinkError> {
  const body = parseJson(await response.text());
  const retryAfter = parseRetryAfter(response);
  const requestId = header(response, 'x-request-id');
  const extra = {
    status: response.status,
    ...(retryAfter === undefined ? {} : { retryAfter }),
    ...(requestId === null ? {} : { requestId }),
  };
  if (isRecord(body) && typeof body['code'] === 'string' && body['code'] !== '') {
    const message = body['message'];
    return new OmnillinkError({
      code: body['code'],
      message: typeof message === 'string' && message !== '' ? message : `Request failed (${body['code']})`,
      ...extra,
    });
  }
  const reason = response.statusText ? ` ${response.statusText}` : '';
  return new OmnillinkError({
    code: 'EHTTP',
    message: `Request failed with HTTP ${response.status}${reason}`,
    ...extra,
  });
}

/** Options as the implementation sees them; the precise types are the interface's. */
type Params = Record<string, unknown> | undefined;

/**
 * Creates a client bound to one Omnillink instance.
 *
 * @example
 * const omnillink = createClient({ baseUrl: 'https://links.example.com' });
 * const { data } = await omnillink.meta('https://github.com');
 */
export function createClient(options: ClientOptions): OmnillinkClient {
  if (!isRecord(options)) {
    throw new TypeError('Omnillink: createClient() expects an options object with `baseUrl`');
  }
  const base = normalizeBaseUrl(options.baseUrl);
  const { apiKey, fetch: customFetch } = options;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** Runs one request and hands the 2xx (or expected 304) response to `read`, all under one timeout. */
  async function request<T>(
    endpoint: string,
    accept: string | undefined,
    params: Params,
    read: (response: Response) => Promise<T> | T,
    body?: string,
  ): Promise<T> {
    // Resolved per call so a polyfill installed after createClient() is picked up;
    // called unbound-safe because browsers reject a detached `fetch`.
    const doFetch = customFetch ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init));
    if (customFetch === undefined && typeof globalThis.fetch !== 'function') {
      throw new OmnillinkError({
        code: 'ENETWORK',
        status: 0,
        message: 'No global fetch: pass a `fetch` implementation to createClient()',
      });
    }

    const requestOptions = params as (RequestOptions & { readonly ifNoneMatch?: string }) | undefined;
    const userSignal = requestOptions?.signal;
    const timeoutMs = requestOptions?.timeoutMs ?? defaultTimeoutMs;
    const etag = requestOptions?.ifNoneMatch;
    const conditional = typeof etag === 'string' && etag !== '';
    const controller = new AbortController();
    let timedOut = false;

    const abortedError = (cause?: unknown): OmnillinkError =>
      new OmnillinkError({ code: 'EABORTED', status: 0, message: 'The request was aborted', cause });

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
    if (accept !== undefined) headers['accept'] = accept;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (conditional) headers['if-none-match'] = etag;
    if (apiKey !== undefined && apiKey !== '') headers['x-api-key'] = apiKey;

    try {
      const response = await doFetch(endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
      });
      if (response.status === 304 && conditional) {
        const outcome: NotModified = {
          notModified: true,
          data: undefined,
          meta: undefined,
          response: readInfo(response),
        };
        return outcome as T;
      }
      if (!response.ok) throw await errorFromResponse(response);
      return await read(response);
    } catch (error) {
      if (timedOut) {
        throw new OmnillinkError({
          code: 'ETIMEOUT',
          status: 0,
          message: `No complete response within ${timeoutMs} ms`,
          cause: error,
        });
      }
      if (userSignal?.aborted) throw abortedError(error);
      if (error instanceof OmnillinkError) throw error;
      throw new OmnillinkError({
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

  const readJson = async (response: Response): Promise<unknown> => {
    const body = parseJson(await response.text());
    if (isRecord(body) && body['status'] === 'success' && 'data' in body) {
      return { data: body['data'], meta: body['meta'], response: readInfo(response) };
    }
    const requestId = header(response, 'x-request-id');
    const extra = { status: response.status, ...(requestId === null ? {} : { requestId }) };
    // A 2xx carrying an error envelope is still an API error.
    if (isRecord(body) && typeof body['code'] === 'string' && typeof body['message'] === 'string') {
      throw new OmnillinkError({ code: body['code'], message: body['message'], ...extra });
    }
    throw new OmnillinkError({
      code: 'EBADRESPONSE',
      message: 'The server answered with something that is not an Omnillink response',
      ...extra,
    });
  };

  const readText = async (response: Response): Promise<OmnillinkText> => ({
    data: await response.text(),
    response: readInfo(response),
  });

  const readBlob = async (response: Response): Promise<Blob> => {
    const blob = await response.blob();
    infos.set(blob, readInfo(response));
    return blob;
  };

  const url = (endpoint: Endpoint, target: string, params: Params, extra?: Params): string =>
    buildUrl(base, endpoint, { url: target, ...params, ...extra });

  // The methods are `async` so that an invalid argument rejects instead of throwing.
  const json =
    (endpoint: Endpoint, extra?: Params) =>
    async (target: string, opts?: Params): Promise<unknown> =>
      request(url(endpoint, target, opts, extra), 'application/json', opts, readJson);
  const text =
    (endpoint: Endpoint, extra: (opts: Params) => Params) =>
    async (target: string, opts?: Params): Promise<unknown> =>
      request(url(endpoint, target, opts, extra(opts)), undefined, opts, readText);
  const binary =
    (endpoint: Endpoint) =>
    async (target: string, opts?: Params): Promise<Blob> =>
      request(url(endpoint, target, opts), undefined, opts, readBlob);
  const builder =
    (endpoint: Endpoint, extra?: Params) =>
    (target: string, opts?: Params): string =>
      url(endpoint, target, opts, extra);

  /** `/extract` takes rules or a preset, never both; either one comes right after `url`. */
  const extraction = (target: string, what: Record<string, string>, opts: Params): Promise<unknown> =>
    request(
      buildUrl(base, 'extract', { url: target, ...what, ...opts, fields: what['fields'], preset: what['preset'] }),
      'application/json',
      opts,
      readJson,
    );

  const client = {
    meta: json('meta'),
    metaBatch: async (urls: readonly string[], opts?: Params) => {
      if (!Array.isArray(urls) || urls.length === 0 || urls.some((item) => typeof item !== 'string' || item === '')) {
        throw invalid('EINVALIDURL', '`urls` must be a non-empty array of URLs');
      }
      const body = JSON.stringify({ urls, force: opts?.['force'], ttl: opts?.['ttl'] });
      return request(`${base}/api/v1/meta/batch`, 'application/json', opts, readJson, body);
    },
    extract: async (target: string, fields: ExtractFields, opts?: Params) => {
      if (!isRecord(fields)) throw invalid('EINVALIDPARAMS', '`fields` must be an object of extraction rules');
      return extraction(target, { fields: JSON.stringify(fields) }, opts);
    },
    extractPreset: async (target: string, preset: string, opts?: Params) => {
      if (typeof preset !== 'string' || preset === '') throw invalid('EINVALIDPARAMS', '`preset` must be a preset name');
      return extraction(target, { preset }, opts);
    },
    content: json('content', { format: undefined }),
    tables: json('tables', { format: undefined, table: undefined }),
    links: json('links'),
    tech: json('tech'),
    insights: json('insights'),
    image: json('image'),
    palette: json('palette'),
    favicon: json('favicon', { redirect: undefined }),
    oembed: json('oembed'),
    sitemap: json('sitemap'),
    check: json('check'),

    html: text('html', () => undefined),
    contentText: text('content', (opts) => ({ format: opts?.['format'] === 'text' ? 'text' : 'markdown' })),
    tablesCsv: text('tables', () => ({ format: 'csv' })),

    screenshot: binary('screenshot'),
    pdf: binary('pdf'),
    animation: binary('animation'),
    qr: binary('qr'),
    og: async (params: Params) => request(buildUrl(base, 'og', params, 'title'), undefined, params, readBlob),

    screenshotUrl: builder('screenshot'),
    pdfUrl: builder('pdf'),
    animationUrl: builder('animation'),
    qrUrl: builder('qr'),
    ogUrl: (params: Params) => buildUrl(base, 'og', params, 'title'),
    faviconUrl: builder('favicon', { redirect: true }),
    metaEmbedUrl: (target: string, path: string, opts?: Params) => {
      if (typeof path !== 'string' || path === '') {
        throw invalid('EINVALIDPARAMS', '`path` must be a dot path into the metadata, e.g. "image.url"');
      }
      return url('meta', target, opts, { embed: path });
    },
  } satisfies Record<keyof OmnillinkClient, unknown>;

  // The table above is checked for completeness; the precise signatures are the interface's.
  return client as unknown as OmnillinkClient;
}
