/**
 * Public types of the Omnillink API, as seen by a client.
 * This file is types only: it adds nothing to the JavaScript output.
 */

/** Browser rendering strategy of the endpoints that read a page. */
export type RenderMode = 'auto' | 'never' | 'always';

/** The `meta` object of every JSON answer. */
export interface ResponseMeta {
  /** True when the answer came from the server cache. */
  readonly cached: boolean;
  /** Pipeline that produced the data: raw HTTP or a headless browser. */
  readonly source: 'http' | 'browser';
  /** Server-side processing time, in milliseconds. */
  readonly durationMs: number;
}

/** What the JSON methods of the client resolve to. */
export interface OmnillinkResult<T> {
  readonly data: T;
  readonly meta: ResponseMeta;
}

// ---------------------------------------------------------------- /meta ----

export interface MetaImage {
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
  /** Media type, e.g. `image/png`. */
  readonly type: string | null;
  readonly alt: string | null;
}

export interface MetaLogo {
  readonly url: string;
}

export interface MetaVideo {
  readonly url: string;
  /** Media type; `text/html` when the URL is an embeddable player. */
  readonly type: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface MetaAudio {
  readonly url: string;
  readonly type: string | null;
}

export interface MetaFeed {
  readonly url: string;
  readonly title: string | null;
  /** Declared media type, e.g. `application/rss+xml`. */
  readonly type: string;
}

/** `data` of `GET /meta`. */
export interface LinkMetadata {
  /** Final URL of the document, after redirects. */
  readonly url: string;
  readonly canonicalUrl: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly author: string | null;
  /** Site or publisher name. */
  readonly publisher: string | null;
  /** BCP 47 language tag declared by the document. */
  readonly lang: string | null;
  /** Publication date as an ISO 8601 string. */
  readonly date: string | null;
  /** Primary preview image. */
  readonly image: MetaImage | null;
  /** Every image the page declares, in priority order. */
  readonly images: readonly MetaImage[];
  readonly favicon: string | null;
  /** Best brand icon of the site. */
  readonly logo: MetaLogo | null;
  readonly video: MetaVideo | null;
  readonly audio: MetaAudio | null;
  readonly keywords: readonly string[];
  /** RSS / Atom / JSON feeds advertised by the page. */
  readonly feeds: readonly MetaFeed[];
  /** JSON-LD blocks found in the page, untouched. */
  readonly jsonLd: readonly unknown[];
  /** Media type of the document, e.g. `text/html`. */
  readonly contentType: string | null;
}

// ------------------------------------------------------------- /extract ----

export type ExtractFieldType = 'string' | 'number' | 'url';

/** One scraping rule of `GET /extract`. */
export interface ExtractField {
  /** CSS selector locating the element(s). */
  readonly selector: string;
  /** `text` (default), `html`, or the name of an attribute to read. */
  readonly attr?: 'text' | 'html' | (string & {});
  /** How the value is coerced. Defaults to `string`. */
  readonly type?: ExtractFieldType;
  /** When true, every match is returned as an array instead of the first one. */
  readonly all?: boolean;
}

/** Rules keyed by the name of the field they produce. */
export type ExtractFields = Readonly<Record<string, ExtractField>>;

type ExtractScalar<R> = 'type' extends keyof R
  ? [R['type' & keyof R]] extends ['number']
    ? number
    : ['number'] extends [R['type' & keyof R]]
      ? string | number // `type` is not known precisely
      : string
  : string;

type ExtractValue<R, S> = 'all' extends keyof R
  ? [R['all' & keyof R]] extends [true]
    ? S[]
    : [true] extends [R['all' & keyof R]]
      ? S[] | S | null // `all` is only known to be a boolean
      : S | null
  : S | null;

/**
 * The `fields` object the server returns for a given set of rules: a field
 * declared with `all: true` is an array, any other field is a value, or `null`
 * when nothing matched.
 */
export type ExtractedFields<F extends ExtractFields> = {
  -readonly [K in keyof F]: ExtractValue<F[K], ExtractScalar<F[K]>>;
};

/** `data` of `GET /extract`. */
export interface ExtractData<F extends ExtractFields = ExtractFields> {
  /** Final URL of the document, after redirects. */
  readonly url: string;
  readonly fields: ExtractedFields<F>;
}

// ------------------------------------------------------------- /content ----

/** `data` of `GET /content`. */
export interface ReadableContent {
  /** Final URL of the document, after redirects. */
  readonly url: string;
  readonly title: string | null;
  readonly lang: string | null;
  readonly excerpt: string | null;
  /** Main content as plain text. */
  readonly text: string;
  /** Main content as Markdown. */
  readonly markdown: string;
  readonly wordCount: number;
  readonly readingTimeMinutes: number;
}

// -------------------------------------------------------------- options ----

/** Options every request accepts, on top of the endpoint's own parameters. */
export interface RequestOptions {
  /** Aborts the request. The promise then rejects with code `EABORTED`. */
  readonly signal?: AbortSignal;
  /** Overrides the client's `timeoutMs` for this request. `0` disables it. */
  readonly timeoutMs?: number;
}

export interface CacheOptions {
  /** Bypass the cache read (the result is still stored). */
  readonly force?: boolean;
  /** Cache lifetime of this answer, in seconds. */
  readonly ttl?: number;
}

export interface MetaOptions extends CacheOptions {
  readonly render?: RenderMode;
}

export interface ExtractOptions {
  readonly render?: RenderMode;
}

export interface ContentOptions {
  readonly render?: RenderMode;
}

export interface ScreenshotOptions extends CacheOptions {
  /** Viewport profile. Defaults to `desktop`. */
  readonly device?: 'desktop' | 'mobile';
  /** Capture the whole page instead of the viewport. */
  readonly fullPage?: boolean;
  readonly format?: 'png' | 'jpeg';
  /** JPEG quality, 1-100. */
  readonly quality?: number;
  /** Viewport width, in CSS pixels. */
  readonly width?: number;
  /** Viewport height, in CSS pixels. */
  readonly height?: number;
  /** Capture only the first element matching this CSS selector. */
  readonly selector?: string;
  /** What to wait for before the capture; sent to the server as is. */
  readonly waitFor?: string | number;
  readonly colorScheme?: 'light' | 'dark';
  /** CSS selectors to hide before the capture (cookie banners, ads...). */
  readonly hide?: string | readonly string[];
}

export interface PdfOptions extends CacheOptions {
  readonly format?: 'A4' | 'Letter';
  readonly landscape?: boolean;
  readonly printBackground?: boolean;
}

/** Options of the client itself. */
export interface ClientOptions {
  /**
   * Origin of the Omnillink instance, e.g. `https://links.example.com`.
   * `/api/v1` is appended for you. An empty string means "same origin" (browsers only).
   */
  readonly baseUrl: string;
  /** Sent as the `x-api-key` header. Never added to the URLs the builders return. */
  readonly apiKey?: string;
  /** `fetch` implementation. Defaults to the global one. */
  readonly fetch?: typeof fetch;
  /** Time allowed for a whole request, body included. Default 30 000; `0` disables it. */
  readonly timeoutMs?: number;
}
