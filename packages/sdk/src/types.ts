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

/** Quota of the current window, from the `x-ratelimit-*` headers. */
export interface RateLimitInfo {
  /** Requests allowed per window. */
  readonly limit: number | null;
  /** Requests left in the current window. */
  readonly remaining: number | null;
  /** Seconds until the window resets. */
  readonly reset: number | null;
}

/**
 * What the response headers say about an answer. Every field is `null` when
 * the header is absent (or hidden from browser code by a proxy's CORS policy).
 */
export interface ResponseInfo {
  /** HTTP status of the answer (`200`, or `304` for a "not modified" outcome). */
  readonly status: number;
  /** `x-cache`: whether the server cache answered. */
  readonly cache: 'HIT' | 'MISS' | null;
  /** `x-render-source`: the pipeline that produced the answer. */
  readonly renderSource: 'http' | 'browser' | null;
  /** `x-request-id`: quote it when reporting a problem. */
  readonly requestId: string | null;
  /** `etag`: pass it back as `ifNoneMatch` to revalidate. */
  readonly etag: string | null;
  /** `null` when the server sent no rate-limit header at all. */
  readonly rateLimit: RateLimitInfo | null;
  /** `x-final-url` (`html()` only): URL of the document after redirects. */
  readonly finalUrl: string | null;
  /** `x-animation-frames` (`animation()` only): frames in the file, possibly fewer than asked. */
  readonly animationFrames: number | null;
  /** `x-qr-version` (`qr()` only): QR symbol version, 1–40. */
  readonly qrVersion: number | null;
}

/** What the JSON methods of the client resolve to. */
export interface OmnillinkResult<T, M = ResponseMeta> {
  readonly data: T;
  readonly meta: M;
  /** Response headers of this answer: cache state, request id, quota, `etag`. */
  readonly response: ResponseInfo;
  readonly notModified?: false;
}

/** What a text method (`html()`, `contentText()`, `tablesCsv()`) resolves to. */
export interface OmnillinkText {
  /** The body, as text. Third-party content: never inject it into a page as is. */
  readonly data: string;
  readonly response: ResponseInfo;
  readonly notModified?: false;
}

/**
 * Outcome of a request sent with `ifNoneMatch` when the server answered
 * `304 Not Modified`: your copy is current, there is no body.
 */
export interface NotModified {
  readonly notModified: true;
  readonly data: undefined;
  readonly meta: undefined;
  readonly response: ResponseInfo;
}

/** Adds `ifNoneMatch` to the options of a method that can be revalidated. */
export type Conditional<O> = O & {
  /**
   * An `etag` from a previous answer (`result.response.etag`). When it is still
   * current the promise resolves to a {@link NotModified} outcome instead of data.
   */
  readonly ifNoneMatch?: string;
};

/** `R`, or `R | NotModified` when the options carry (or may carry) `ifNoneMatch`. */
export type MaybeNotModified<R, O> = 'ifNoneMatch' extends keyof O
  ? [O['ifNoneMatch' & keyof O]] extends [undefined]
    ? R
    : R | NotModified
  : R;

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

export interface MetaAlternate {
  /** BCP 47 tag, or `x-default`. */
  readonly lang: string;
  readonly url: string;
}

export interface MetaTwitter {
  /** `twitter:card`. */
  readonly card: string | null;
  /** `twitter:site` (@handle). */
  readonly site: string | null;
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
  /** Last-modification date as an ISO 8601 string. */
  readonly dateModified: string | null;
  /** `og:type` (`article`, `website`…), else the main JSON-LD `@type`. */
  readonly type: string | null;
  /** `<meta name="theme-color">`. */
  readonly themeColor: string | null;
  /** `<meta name="robots">` directives, as declared. */
  readonly robots: string | null;
  /** oEmbed endpoint advertised by the page (see `oembed()`). */
  readonly oembed: string | null;
  /** Translations advertised with `hreflang` (at most 50). */
  readonly alternates: readonly MetaAlternate[];
  readonly twitter: MetaTwitter;
  /** `true` / `false` when JSON-LD says so (`isAccessibleForFree`), `null` when the page says nothing. */
  readonly paywalled: boolean | null;
  /** Host of `url`, without a leading `www.`. */
  readonly domain: string | null;
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
  /** JSON-LD blocks found in the page, `@graph` flattened. */
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

// ---- presets

export type ExtractPreset = 'article' | 'product' | 'recipe' | 'event';

/** Where a preset field was read from, most reliable first. */
export type PresetSource = 'json-ld' | 'microdata' | 'opengraph' | 'meta' | 'css';

/** Fields of each preset. Every one is `null` when the page does not declare it. */
export interface PresetFieldMap {
  readonly article: {
    readonly headline: string | null;
    readonly description: string | null;
    readonly author: string | null;
    readonly authorUrl: string | null;
    readonly publisher: string | null;
    /** ISO 8601. */
    readonly datePublished: string | null;
    /** ISO 8601. */
    readonly dateModified: string | null;
    readonly image: string | null;
    readonly section: string | null;
    readonly keywords: readonly string[] | null;
    readonly language: string | null;
    readonly wordCount: number | null;
    readonly url: string | null;
  };
  readonly product: {
    readonly name: string | null;
    readonly description: string | null;
    readonly brand: string | null;
    readonly sku: string | null;
    readonly gtin: string | null;
    readonly image: string | null;
    readonly price: number | null;
    readonly currency: string | null;
    /** schema.org enumeration without its prefix, e.g. `InStock`. */
    readonly availability: string | null;
    /** e.g. `NewCondition`. */
    readonly condition: string | null;
    readonly ratingValue: number | null;
    readonly reviewCount: number | null;
    readonly seller: string | null;
    readonly url: string | null;
  };
  readonly recipe: {
    readonly name: string | null;
    readonly description: string | null;
    readonly author: string | null;
    readonly image: string | null;
    readonly datePublished: string | null;
    readonly prepMinutes: number | null;
    readonly cookMinutes: number | null;
    readonly totalMinutes: number | null;
    readonly yield: string | null;
    readonly category: string | null;
    readonly cuisine: string | null;
    readonly calories: string | null;
    readonly ingredients: readonly string[] | null;
    readonly instructions: readonly string[] | null;
    readonly keywords: readonly string[] | null;
    readonly ratingValue: number | null;
    readonly ratingCount: number | null;
  };
  readonly event: {
    readonly name: string | null;
    readonly description: string | null;
    readonly startDate: string | null;
    readonly endDate: string | null;
    /** e.g. `EventScheduled`. */
    readonly status: string | null;
    /** e.g. `OfflineEventAttendanceMode`. */
    readonly attendanceMode: string | null;
    readonly locationName: string | null;
    /** The address on one line. */
    readonly address: string | null;
    readonly image: string | null;
    readonly organizer: string | null;
    readonly performers: readonly string[] | null;
    readonly price: number | null;
    readonly currency: string | null;
    readonly availability: string | null;
    readonly url: string | null;
  };
}

/** `data` of `GET /extract?preset=…`. */
export interface PresetData<P extends ExtractPreset = ExtractPreset> {
  /** Final URL of the document, after redirects. */
  readonly url: string;
  readonly preset: P;
  /** schema.org type of the node the fields were read from; `null` when the page declares none. */
  readonly schemaType: string | null;
  readonly fields: PresetFieldMap[P];
  /** Field name → where its value came from; `null` for a field that is `null`. */
  readonly sources: { readonly [K in keyof PresetFieldMap[P]]: PresetSource | null };
}

// ------------------------------------------------------------- /content ----

export interface ContentLink {
  /** Absolute http(s) URL. */
  readonly url: string;
  /** Visible text of the link (at most 200 characters). */
  readonly text: string;
  /** Same host as the page (`www.` ignored). */
  readonly internal: boolean;
}

export interface ContentImage {
  /** Absolute URL of the largest rendition offered. */
  readonly url: string;
  readonly alt: string;
}

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
  /** True when `text` or `markdown` was cut at the server's size cap. */
  readonly truncated: boolean;
  /** Links of the extracted content, de-duplicated (at most 500). */
  readonly links: readonly ContentLink[];
  /** Images of the extracted content, de-duplicated (at most 200). */
  readonly images: readonly ContentImage[];
}

// -------------------------------------------------------------- /tables ----

export interface PageTable {
  readonly index: number;
  readonly caption: string | null;
  /** Column names; empty when the table has none. */
  readonly headers: readonly string[];
  /** Body rows as text, spans expanded: every row has `columnCount` values. */
  readonly rows: readonly (readonly string[])[];
  readonly rowCount: number;
  readonly columnCount: number;
  /** Rows or columns of this table were dropped by a cap. */
  readonly truncated: boolean;
}

/** `data` of `GET /tables`. */
export interface TablesData {
  readonly url: string;
  /** Data tables found on the page (layout tables are skipped). */
  readonly total: number;
  readonly tables: readonly PageTable[];
  readonly truncated: boolean;
}

// --------------------------------------------------------------- /links ----

export interface PageLink {
  /** Absolute http(s) URL, fragment removed. */
  readonly url: string;
  readonly text: string;
  /** Tokens of `rel`, lower-cased. */
  readonly rel: readonly string[];
  readonly internal: boolean;
  /** `rel` contains `nofollow`, `sponsored` or `ugc`. */
  readonly nofollow: boolean;
}

/** `data` of `GET /links`. */
export interface LinksData {
  readonly url: string;
  /** Distinct links on the page, before `scope` and `limit`. */
  readonly total: number;
  readonly internal: number;
  readonly external: number;
  readonly links: readonly PageLink[];
  readonly truncated: boolean;
}

// ---------------------------------------------------------------- /tech ----

/** Categories the API knows today. */
export type KnownTechCategory =
  | 'cms'
  | 'ecommerce'
  | 'framework'
  | 'library'
  | 'ui'
  | 'build-tool'
  | 'analytics'
  | 'tag-manager'
  | 'monitoring'
  | 'advertising'
  | 'cdn'
  | 'server'
  | 'hosting'
  | 'language'
  | 'site-builder'
  | 'consent'
  | 'payment'
  | 'font'
  | 'chat'
  | 'security'
  | 'widget';

/** Open to the categories a newer server may add. */
export type TechCategory = KnownTechCategory | (string & {});

export interface Technology {
  readonly name: string;
  readonly category: TechCategory;
  /** What triggered the detection: `header …`, `bundle <path>: …`, `probe: <key>`… */
  readonly evidence: string;
  readonly confidence: 'high' | 'medium' | 'low';
  /** Version stated by that very evidence; `null` when it states none. */
  readonly version: string | null;
}

/** `data` of `GET /tech`. */
export interface TechData {
  readonly url: string;
  readonly technologies: readonly Technology[];
  /** What the detection looked at: an absence is only as strong as this. */
  readonly inspected: { readonly bundles: number; readonly rendered: boolean };
}

// ------------------------------------------------------------ /insights ----

export interface ResourceWeight {
  readonly requests: number;
  /** Encoded bytes received, response headers included. */
  readonly transferBytes: number;
}

export type ResourceKind = 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'xhr' | 'other';

/**
 * `data` of `GET /insights`. Every number is a lab measurement from a single
 * load in a data-centre headless browser: not a field score, not a Lighthouse audit.
 */
export interface InsightsData {
  readonly url: string;
  readonly device: 'desktop' | 'mobile';
  readonly measurement: 'lab';
  /** ISO 8601 time of the measurement (a cached answer keeps its original time). */
  readonly measuredAt: string;
  /** HTTP status of the document. */
  readonly status: number;
  /** False when `load` did not fire in time: the figures are then partial. */
  readonly loaded: boolean;
  readonly timings: {
    readonly ttfbMs: number | null;
    readonly domContentLoadedMs: number | null;
    readonly loadMs: number | null;
  };
  readonly vitals: {
    readonly fcpMs: number | null;
    readonly lcpMs: number | null;
    /** Tag name of the LCP element (`img`, `h1`…). */
    readonly lcpElement: string | null;
    readonly cls: number | null;
  };
  readonly network: ResourceWeight & {
    readonly byType: Readonly<Record<ResourceKind, ResourceWeight>>;
    readonly thirdParty: ResourceWeight & { readonly hostCount: number; readonly hosts: readonly string[] };
    /** Per-page cap that stopped the load, if any: the figures are then a lower bound. */
    readonly limitReached: 'requests' | 'bytes' | null;
  };
  readonly dom: { readonly elements: number | null };
  readonly technologies: readonly Technology[];
}

// --------------------------------------------------------------- /image ----

/** `data` of `GET /image`. */
export interface ImageData {
  /** URL of the image measured, after redirects. */
  readonly url: string;
  /** The page it was found on, when the target was a page. */
  readonly pageUrl: string | null;
  /** `png`, `jpeg`, `gif` or `webp`; `null` when not recognised (SVG, AVIF…). */
  readonly format: string | null;
  readonly contentType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  /** File size announced by the server. */
  readonly bytes: number | null;
}

// ------------------------------------------------------------- /palette ----

export interface PaletteColor {
  /** `#rrggbb`. */
  readonly hex: string;
  readonly rgb: readonly [number, number, number];
  /** Share of the sampled pixels this colour stands for (0–1). */
  readonly population: number;
}

/** `data` of `GET /palette`. */
export interface PaletteData {
  readonly url: string;
  readonly pageUrl: string | null;
  readonly format: string | null;
  /** The colour with the largest population, `#rrggbb`. */
  readonly dominant: string;
  /** Most frequent colour first. */
  readonly colors: readonly PaletteColor[];
}

// ------------------------------------------------------------- /favicon ----

export interface SiteIcon {
  readonly url: string;
  /** Where it was declared; `default` is `/favicon.ico`. */
  readonly rel: 'icon' | 'apple-touch-icon' | 'manifest' | 'default';
  /** `sizes` as declared; the real size is in `width` / `height`. */
  readonly declaredSizes: string | null;
  /** `png`, `jpeg`, `gif`, `webp`, `ico` or `svg`. */
  readonly format: string | null;
  readonly contentType: string | null;
  /** Real width in pixels, read from the file; `null` for SVG. */
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
}

/** `data` of `GET /favicon`. */
export interface FaviconData {
  readonly pageUrl: string;
  /** The best icon. */
  readonly icon: SiteIcon;
  /** Every icon measured, largest first. */
  readonly icons: readonly SiteIcon[];
}

// -------------------------------------------------------------- /oembed ----

/** `data` of `GET /oembed`. */
export interface OembedData {
  /** The page the embed describes, after redirects. */
  readonly url: string;
  /** The oEmbed endpoint that was read, as advertised by the page. */
  readonly endpoint: string;
  readonly type: 'photo' | 'video' | 'link' | 'rich' | null;
  readonly version: string | null;
  readonly title: string | null;
  readonly authorName: string | null;
  readonly authorUrl: string | null;
  readonly providerName: string | null;
  readonly providerUrl: string | null;
  readonly thumbnailUrl: string | null;
  readonly thumbnailWidth: number | null;
  readonly thumbnailHeight: number | null;
  readonly width: number | null;
  readonly height: number | null;
  /** `photo` only: URL of the image. */
  readonly photoUrl: string | null;
  /**
   * UNTRUSTED third-party markup, exactly as the provider sent it (it may
   * contain scripts). Never inject it into a page without a sandbox
   * (`<iframe sandbox>`) or a sanitiser.
   */
  readonly html: string | null;
  /** Lifetime suggested by the provider, in seconds. */
  readonly cacheAge: number | null;
}

// ------------------------------------------------------------- /sitemap ----

export interface SitemapFile {
  readonly url: string;
  readonly kind: 'index' | 'urlset' | 'unknown';
  /** `<url>` entries of this file (0 for an index). */
  readonly urlCount: number;
  /** Why the file could not be read (`HTTP 404`, an error code…), else `null`. */
  readonly error: string | null;
}

/** `data` of `GET /sitemap`. */
export interface SitemapData {
  readonly robotsUrl: string;
  readonly robotsFound: boolean;
  /** Files read, in discovery order. */
  readonly sitemaps: readonly SitemapFile[];
  /** URLs counted across every file read. */
  readonly urlCount: number;
  readonly urls: readonly { readonly url: string; readonly lastmod: string | null }[];
  /** A cap (files, bytes, URLs or time) cut the result short. */
  readonly truncated: boolean;
}

// --------------------------------------------------------------- /check ----

export interface CheckHop {
  readonly url: string;
  readonly status: number;
  /** Connection + TLS + time to response headers. */
  readonly durationMs: number;
  /** Where this hop redirects; `null` on the last one. */
  readonly location: string | null;
}

export interface CheckTls {
  /** Common name of the certificate. */
  readonly subject: string | null;
  readonly issuer: string | null;
  /** ISO 8601. */
  readonly validFrom: string;
  /** ISO 8601. */
  readonly validTo: string;
  /** Whole days until expiry. */
  readonly daysLeft: number;
}

/** `data` of `GET /check`. An HTTP error of the target is a result (`ok: false`), not a thrown error. */
export interface LinkCheck {
  /** The URL checked, normalised. */
  readonly url: string;
  /** URL of the last hop. */
  readonly finalUrl: string;
  /** True when the final status is below 400. */
  readonly ok: boolean;
  /** HTTP status of the last hop. */
  readonly status: number;
  /** Every hop, the last one included, in order. */
  readonly redirects: readonly CheckHop[];
  readonly contentType: string | null;
  readonly contentLength: number | null;
  /** Certificate of the last hop; `null` over plain http. */
  readonly tls: CheckTls | null;
  /** Whole check, every hop included. */
  readonly durationMs: number;
}

/** `meta` of `GET /check`: the check is never cached. */
export interface CheckMeta {
  readonly durationMs: number;
}

// ---------------------------------------------------------- /meta/batch ----

export type MetaBatchItem =
  | {
      /** The URL as it was submitted. */
      readonly url: string;
      readonly status: 'success';
      readonly data: LinkMetadata;
      readonly cached: boolean;
    }
  | {
      readonly url: string;
      readonly status: 'fail' | 'error';
      /** Same codes as `meta()`. */
      readonly code: string;
      readonly message: string;
      readonly data?: undefined;
    };

export interface MetaBatchMeta {
  readonly succeeded: number;
  readonly failed: number;
  readonly durationMs: number;
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
  /** Cache lifetime of this answer, in seconds (60–86400). */
  readonly ttl?: number;
}

/**
 * The only request headers that can be set on the request to the target. No
 * cookie, no `Authorization`: answers are cached by URL and shared between callers.
 */
export interface TargetHeaderOptions {
  /** `Accept-Language` sent to the target, e.g. `fr-FR,fr;q=0.9`. */
  readonly acceptLanguage?: string;
  /** `User-Agent` sent to the target (printable ASCII). */
  readonly userAgent?: string;
  /** `Referer` sent with the document request: an absolute http(s) URL. */
  readonly referer?: string;
}

/** Options shared by the endpoints that read a page. */
export interface PageOptions extends CacheOptions, TargetHeaderOptions {}

/** CSS selectors, as one comma-separated string or as a list. */
export type SelectorList = string | readonly string[];

export interface MetaOptions extends PageOptions {
  readonly render?: RenderMode;
}

export interface MetaBatchOptions extends CacheOptions {}

export interface ExtractOptions extends PageOptions {
  readonly render?: RenderMode;
  /** CSS selector that must be in the DOM before the page is read. Forces the browser. */
  readonly waitForSelector?: string;
}

export interface ContentOptions extends PageOptions {
  readonly render?: RenderMode;
  /** `false` keeps the whole `<body>` instead of the main content. Default `true`. */
  readonly mainContent?: boolean;
  /** Keep only the elements matching these selectors; replaces main-content detection. */
  readonly include?: SelectorList;
  /** Remove the elements matching these selectors before extraction. */
  readonly exclude?: SelectorList;
  /** Reference-style links in `markdown`: `[label][1]`, the numbered URLs at the end. */
  readonly citations?: boolean;
  readonly waitForSelector?: string;
}

export interface ContentTextOptions extends ContentOptions {
  /** Which body to return. Default `markdown`. */
  readonly format?: 'markdown' | 'text';
}

export interface TablesOptions extends PageOptions {
  readonly render?: RenderMode;
  /** CSS selector restricting which `<table>` elements are read. */
  readonly selector?: string;
}

export interface TablesCsvOptions extends TablesOptions {
  /** Index of the table to export, as numbered by `tables()`. Default `0`. */
  readonly table?: number;
}

export interface LinksOptions extends PageOptions {
  readonly render?: RenderMode;
  /** Keep every link, or only those on / off the page's own host. Default `all`. */
  readonly scope?: 'all' | 'internal' | 'external';
  /** Most links returned (1–2000, default 500). */
  readonly limit?: number;
}

export interface HtmlOptions extends PageOptions {
  /** Default `always`: the DOM serialised after scripts have run. `never`: the markup as served. */
  readonly render?: RenderMode;
  readonly waitForSelector?: string;
}

export interface TechOptions extends PageOptions {
  readonly render?: RenderMode;
}

export interface InsightsOptions extends PageOptions {
  /** Viewport profile. No network or CPU throttling is applied in either case. */
  readonly device?: 'desktop' | 'mobile';
}

export interface ImageOptions extends CacheOptions {}

export interface PaletteOptions extends CacheOptions {
  /** Colours wanted (2–8, default 5); a flat image yields fewer. */
  readonly count?: number;
}

export interface FaviconOptions extends PageOptions {}

export interface OembedOptions extends PageOptions {
  /** Passed to the provider as `maxwidth`. */
  readonly maxWidth?: number;
  /** Passed to the provider as `maxheight`. */
  readonly maxHeight?: number;
}

export interface SitemapOptions extends CacheOptions {
  /** Most URLs returned in `urls` (1–5000, default 500). `urlCount` still counts all of them. */
  readonly limit?: number;
}

export interface ScreenshotOptions extends PageOptions {
  /** Viewport profile. Defaults to `desktop`. */
  readonly device?: 'desktop' | 'mobile';
  /** Capture the whole page instead of the viewport. */
  readonly fullPage?: boolean;
  readonly format?: 'png' | 'jpeg';
  /** JPEG quality, 1-100. */
  readonly quality?: number;
  /** Viewport width, in CSS pixels (320–2560). */
  readonly width?: number;
  /** Viewport height, in CSS pixels (240–2160). */
  readonly height?: number;
  /** Capture only the first element matching this CSS selector. */
  readonly selector?: string;
  /** Extra wait before the capture, in milliseconds (0–10000). Sent to the server as is. */
  readonly waitFor?: number | string;
  /** CSS selector that must be in the DOM before the capture. */
  readonly waitForSelector?: string;
  /** CSS selector of one element to click before the capture. */
  readonly click?: string;
  /** CSS selector of an element to scroll into view before the capture. */
  readonly scrollTo?: string;
  readonly colorScheme?: 'light' | 'dark';
  /** CSS selectors to hide before the capture (cookie banners, ads...). */
  readonly hide?: SelectorList;
  /** Hide common cookie / consent banners (nothing is clicked). Default `true`. */
  readonly hideBanners?: boolean;
  /** Drop requests to well-known advertising and tracking hosts. Default `false`. */
  readonly blockAds?: boolean;
  /** Device frame drawn around the capture. Not available with `fullPage`. */
  readonly frame?: 'none' | 'browser' | 'phone';
  /** Corner radius of the capture, in pixels (0–64). */
  readonly radius?: number;
  /** Space around the capture, in pixels (0–200), filled with `background`. */
  readonly padding?: number;
  /** Hexadecimal colour behind the capture (`RGB`, `RRGGBB`, `RRGGBBAA`, `#` optional). */
  readonly background?: string;
}

export interface PdfOptions extends PageOptions {
  readonly format?: 'A4' | 'Letter';
  readonly landscape?: boolean;
  readonly printBackground?: boolean;
  /** Hide common cookie / consent banners before printing. Default `false`. */
  readonly hideBanners?: boolean;
  readonly blockAds?: boolean;
  readonly waitForSelector?: string;
  /** Margin on every side, in millimetres (0–50). Default: the page's own `@page` margins. */
  readonly margin?: number;
  /** Scale of the rendering (0.1–2). */
  readonly scale?: number;
  /** Pages to keep, e.g. `1-3,5`. */
  readonly pageRanges?: string;
  /** Plain text printed at the top of every page; `{page}`, `{pages}`, `{title}`, `{url}`, `{date}` are filled in. */
  readonly headerText?: string;
  /** Plain text printed at the bottom of every page; same tokens as `headerText`. */
  readonly footerText?: string;
}

export interface AnimationOptions extends PageOptions {
  /** Viewport width in CSS pixels (320–1280, default 800). */
  readonly width?: number;
  /** Viewport height in CSS pixels (240–800, default 500). */
  readonly height?: number;
  /** Frames wanted, evenly spaced from the top to the bottom of the page (2–10, default 6). */
  readonly frames?: number;
  /** Display time of each frame, in milliseconds (100–3000, default 800). */
  readonly delay?: number;
  readonly hideBanners?: boolean;
  readonly blockAds?: boolean;
}

export interface QrOptions {
  /** Default `svg`. */
  readonly format?: 'svg' | 'png';
  /** Width and height of the image, in pixels (64–2048, default 512). */
  readonly size?: number;
  /** Quiet zone around the code, in modules (0–16, default 4). */
  readonly margin?: number;
  /** Error-correction level. Default `M`. */
  readonly ecc?: 'L' | 'M' | 'Q' | 'H';
  /** Colour of the modules, hexadecimal. Default `000000`. */
  readonly color?: string;
  /** Background colour, hexadecimal; `00000000` for transparent. Default `ffffff`. */
  readonly background?: string;
}

/** Parameters of `GET /og`: a social card built from text. No URL is fetched. */
export interface OgOptions extends CacheOptions {
  /** Headline of the card (at most 160 characters). */
  readonly title: string;
  /** Supporting line under the title (at most 300 characters). */
  readonly description?: string;
  /** Site or brand name, bottom left. */
  readonly site?: string;
  /** Author or date, bottom right. */
  readonly author?: string;
  /** Small pill above the title. */
  readonly label?: string;
  readonly template?: 'classic' | 'gradient' | 'split';
  readonly theme?: 'light' | 'dark';
  /** Accent colour, hexadecimal. Default `2563eb`. */
  readonly accent?: string;
  readonly format?: 'png' | 'jpeg';
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
