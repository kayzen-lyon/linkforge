/**
 * Pure HTML → metadata extraction (no I/O, trivially unit-testable).
 *
 * Each field is resolved through an ordered list of sources, from the most
 * explicit signal (Open Graph) down to heuristics (first `<h1>`), mirroring
 * how social networks build link previews.
 */
import { load, type CheerioAPI } from 'cheerio';

export interface MetaImage {
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
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
  /** BCP 47 tag of the translation, or `x-default`. */
  readonly lang: string;
  readonly url: string;
}

export interface MetaTwitter {
  /** `twitter:card`: `summary`, `summary_large_image`, `player`... */
  readonly card: string | null;
  /** `twitter:site`, the @handle of the publishing account. */
  readonly site: string | null;
}

export interface LinkMetadata {
  /** Final URL of the document (after redirects). */
  readonly url: string;
  /** `<link rel="canonical">` / `og:url`, when declared. */
  readonly canonicalUrl: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly author: string | null;
  /** Site or publisher name (`og:site_name`, JSON-LD publisher...). */
  readonly publisher: string | null;
  /** BCP 47 language tag declared by the document. */
  readonly lang: string | null;
  /** Publication date as an ISO 8601 string, when it can be parsed. */
  readonly date: string | null;
  /** Last modification date as an ISO 8601 string, when declared. */
  readonly dateModified: string | null;
  /** Kind of page: `og:type` (`article`, `website`...), else the main JSON-LD `@type`. */
  readonly type: string | null;
  /** `<meta name="theme-color">`. */
  readonly themeColor: string | null;
  /** `<meta name="robots">` directives, as declared (`noindex, nofollow`). */
  readonly robots: string | null;
  /** oEmbed endpoint advertised by the page (JSON preferred over XML). */
  readonly oembed: string | null;
  /** Translations advertised with `<link rel="alternate" hreflang>`. */
  readonly alternates: readonly MetaAlternate[];
  readonly twitter: MetaTwitter;
  /**
   * `true` when JSON-LD declares `isAccessibleForFree: false`, `false` when it
   * declares the content free, `null` when the page says nothing.
   */
  readonly paywalled: boolean | null;
  /** Host name of `url`, without a leading `www.`. */
  readonly domain: string | null;
  /** Primary preview image (first entry of `images`). */
  readonly image: MetaImage | null;
  /** Every Open Graph / Twitter / JSON-LD image, de-duplicated, in priority order. */
  readonly images: readonly MetaImage[];
  readonly favicon: string | null;
  /** Best brand icon: JSON-LD `logo`, else the largest icon the page declares. */
  readonly logo: MetaLogo | null;
  /** Primary video (`og:video*`, `twitter:player`, JSON-LD `VideoObject`). */
  readonly video: MetaVideo | null;
  /** Primary audio stream (`og:audio*`). */
  readonly audio: MetaAudio | null;
  /** `<meta name="keywords">`, `article:tag` and JSON-LD keywords, de-duplicated. */
  readonly keywords: readonly string[];
  /** RSS / Atom / JSON feeds advertised with `<link rel="alternate">`. */
  readonly feeds: readonly MetaFeed[];
  /** Parsed `application/ld+json` blocks, `@graph` containers flattened. */
  readonly jsonLd: readonly unknown[];
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Collapses whitespace and returns `null` for empty strings. */
function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

/** Returns the first non-empty candidate. */
function firstOf(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const value = clean(candidate);
    if (value !== null) return value;
  }
  return null;
}

/** Resolves a possibly relative reference; only http(s) results are kept. */
function resolveUrl(reference: string | null | undefined, base: string): string | null {
  const value = clean(reference);
  if (value === null) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function toInt(value: string | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Plausible range for a publication date expressed as an epoch (1990 → 2100). */
const EPOCH_MIN_MS = Date.UTC(1990, 0, 1);
const EPOCH_MAX_MS = Date.UTC(2100, 0, 1);

/**
 * Parses a declared date into ISO 8601.
 *
 * `new Date()` is far too lenient for untrusted input: `"12"` and `"May 5"`
 * both yield a date in 2001. A value is therefore accepted only when it is an
 * epoch (10 digits: seconds, 13: milliseconds) or carries an explicit
 * four-digit year.
 */
export function toIsoDate(value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim();

  if (/^\d+$/.test(text)) {
    if (text.length !== 10 && text.length !== 13) return null;
    const ms = Number(text) * (text.length === 10 ? 1000 : 1);
    return ms >= EPOCH_MIN_MS && ms < EPOCH_MAX_MS ? new Date(ms).toISOString() : null;
  }
  if (!/(?:^|\D)(?:1[6-9]|2\d)\d{2}(?:\D|$)/.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Normalises a language tag to BCP 47 (`en_US` → `en-US`); `null` when it is not one. */
export function toLanguageTag(value: string | null | undefined): string | null {
  const text = clean(value);
  if (text === null) return null;
  try {
    return Intl.getCanonicalLocales(text.replace(/_/g, '-'))[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads `<meta property|name|itemprop="key" content="...">`. Sites mix the
 * three attributes freely and do not agree on case (`og:Title`, `OG:IMAGE`).
 */
function meta($: CheerioAPI, key: string): string | null {
  const selector = `meta[property="${key}" i], meta[name="${key}" i], meta[itemprop="${key}" i]`;
  return clean($(selector).first().attr('content'));
}

/** Parses every JSON-LD block, tolerating invalid JSON, and flattens `@graph`. */
function extractJsonLd($: CheerioAPI): unknown[] {
  const nodes: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    // Some CMSs wrap the JSON in an HTML comment or a CDATA section (XHTML habits).
    const raw = $(element)
      .text()
      .trim()
      .replace(/^(?:\/\/\s*|\/\*\s*)?<!(?:--|\[CDATA\[)(?:\s*\*\/)?/, '')
      .replace(/(?:\/\/\s*|\/\*\s*)?(?:-->|\]\]>)(?:\s*\*\/)?$/, '')
      .trim();
    if (raw === '') return;
    try {
      const parsed: unknown = JSON.parse(raw);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        if (isObject(item) && Array.isArray(item['@graph'])) nodes.push(...item['@graph']);
        else nodes.push(item);
      }
    } catch {
      // Invalid JSON-LD is extremely common in the wild: skip the block.
    }
  });
  return nodes;
}

const typesOf = (node: JsonObject): string[] => {
  const declared = node['@type'];
  if (typeof declared === 'string') return [declared];
  return Array.isArray(declared) ? declared.filter((t): t is string => typeof t === 'string') : [];
};

/** Types describing the site or its furniture rather than the page being read. */
const SITE_LEVEL_TYPE =
  /^(?:Organization|Corporation|NewsMediaOrganization|LocalBusiness|Person|WebSite|BreadcrumbList|ItemList|SiteNavigationElement|ImageObject|SearchAction|WPHeader|WPFooter|WPSideBar|Brand|ContactPoint|PostalAddress)$/;
const PAGE_LEVEL_TYPE = /^(?:WebPage|\w+Page|CollectionPage)$/;

/**
 * Orders JSON-LD nodes so the one describing the page comes first.
 *
 * A document routinely declares an `Organization` and a `WebSite` next to its
 * `Article`; all three have a `description`. Rank: the type announced by
 * `og:type`, then content types (anything that is not site furniture), then
 * `WebPage`, then untyped nodes, then site-level types. Order is otherwise kept.
 */
function rankJsonLd(nodes: readonly unknown[], ogType: string | null): unknown[] {
  const wanted = (ogType ?? '').split('.')[0]?.toLowerCase() ?? '';
  const rank = (node: unknown): number => {
    if (!isObject(node)) return 5;
    const types = typesOf(node);
    if (types.length === 0) return 3;
    if (wanted !== '' && types.some((type) => type.toLowerCase().includes(wanted))) return 0;
    if (types.every((type) => SITE_LEVEL_TYPE.test(type))) return 4;
    if (types.every((type) => PAGE_LEVEL_TYPE.test(type) || SITE_LEVEL_TYPE.test(type))) return 2;
    return 1;
  };
  return nodes
    .map((node, index) => ({ node, index, rank: rank(node) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.node);
}

/** Reads a name out of a JSON-LD value that may be a string, an object or a list. */
function jsonLdName(value: unknown): string | null {
  if (typeof value === 'string') return clean(value);
  if (Array.isArray(value)) return jsonLdName(value[0]);
  if (isObject(value) && typeof value['name'] === 'string') return clean(value['name']);
  return null;
}

function firstDate(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const date = toIsoDate(clean(candidate));
    if (date !== null) return date;
  }
  return null;
}

/** Reads a string property from the first JSON-LD node that declares it. */
function jsonLdString(nodes: readonly unknown[], key: string): string | null {
  for (const node of nodes) {
    if (isObject(node) && typeof node[key] === 'string') {
      const value = clean(node[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function jsonLdNamed(nodes: readonly unknown[], key: string): string | null {
  for (const node of nodes) {
    if (!isObject(node)) continue;
    const name = jsonLdName(node[key]);
    if (name !== null) return name;
  }
  return null;
}

function jsonLdImages(nodes: readonly unknown[]): string[] {
  const urls: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') urls.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (isObject(value) && typeof value['url'] === 'string') urls.push(value['url']);
  };
  for (const node of nodes) if (isObject(node)) visit(node['image']);
  return urls;
}

/**
 * Collects preview images. Open Graph structured properties
 * (`og:image:width`, `og:image:alt`...) apply to the `og:image` that precedes
 * them in document order.
 */
function extractImages($: CheerioAPI, base: string, jsonLd: readonly unknown[]): MetaImage[] {
  const images: MetaImage[] = [];
  const seen = new Set<string>();
  let current: { -readonly [K in keyof MetaImage]: MetaImage[K] } | null = null;

  const push = (reference: string | null | undefined, alt: string | null = null): void => {
    const url = resolveUrl(reference, base);
    if (url === null || seen.has(url)) {
      current = null;
      return;
    }
    seen.add(url);
    current = { url, width: null, height: null, type: null, alt };
    images.push(current);
  };

  $('meta[property^="og:image" i], meta[name^="og:image" i]').each((_, element) => {
    const property = ($(element).attr('property') ?? $(element).attr('name'))?.toLowerCase();
    const content = $(element).attr('content');
    switch (property) {
      case 'og:image':
      case 'og:image:url':
      case 'og:image:secure_url':
        push(content);
        break;
      case 'og:image:width':
        if (current !== null) current.width = toInt(content);
        break;
      case 'og:image:height':
        if (current !== null) current.height = toInt(content);
        break;
      case 'og:image:type':
        if (current !== null) current.type = clean(content);
        break;
      case 'og:image:alt':
        if (current !== null) current.alt = clean(content);
        break;
      default:
        break;
    }
  });

  push(meta($, 'twitter:image') ?? meta($, 'twitter:image:src'), meta($, 'twitter:image:alt'));
  for (const url of jsonLdImages(jsonLd)) push(url);
  push($('link[rel="image_src"]').attr('href'));

  return images;
}

/** Picks the best icon the page declares (largest size wins), `null` when it declares none. */
function extractDeclaredIcon($: CheerioAPI, base: string): string | null {
  let best: { url: string; score: number } | null = null;

  $('link[rel]').each((_, element) => {
    const rel = ($(element).attr('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) return;

    const url = resolveUrl($(element).attr('href'), base);
    if (url === null) return;

    const sizes = $(element).attr('sizes') ?? '';
    const declared = Number.parseInt(sizes.split(/x/i)[0] ?? '', 10);
    const isVector = sizes === 'any' || url.toLowerCase().endsWith('.svg');
    const fallbackSize = rel.includes('apple-touch-icon') ? 180 : 16;
    const score = isVector ? 1024 : Number.isFinite(declared) ? declared : fallbackSize;

    if (best === null || score > best.score) best = { url, score };
  });

  const picked = best as { url: string; score: number } | null;
  return picked?.url ?? null;
}

/** Reads a URL out of a JSON-LD value that may be a string, an `ImageObject` or a list. */
function jsonLdUrl(value: unknown): string | null {
  if (typeof value === 'string') return clean(value);
  if (Array.isArray(value)) return jsonLdUrl(value[0]);
  if (isObject(value)) {
    return jsonLdUrl(value['url']) ?? jsonLdUrl(value['contentUrl']);
  }
  return null;
}

/** JSON-LD `logo`, declared on a node itself or on its `publisher`. */
function extractJsonLdLogo(nodes: readonly unknown[], base: string): string | null {
  for (const node of nodes) {
    if (!isObject(node)) continue;
    const publisher = node['publisher'];
    const url =
      resolveUrl(jsonLdUrl(node['logo']), base) ??
      (isObject(publisher) ? resolveUrl(jsonLdUrl(publisher['logo']), base) : null);
    if (url !== null) return url;
  }
  return null;
}

const hasJsonLdType = (node: JsonObject, type: string): boolean => typesOf(node).includes(type);

function extractVideo($: CheerioAPI, base: string, jsonLd: readonly unknown[]): MetaVideo | null {
  const ogUrl = resolveUrl(
    meta($, 'og:video:secure_url') ?? meta($, 'og:video:url') ?? meta($, 'og:video'),
    base,
  );
  if (ogUrl !== null) {
    return {
      url: ogUrl,
      type: meta($, 'og:video:type'),
      width: toInt(meta($, 'og:video:width')),
      height: toInt(meta($, 'og:video:height')),
    };
  }

  const player = resolveUrl(meta($, 'twitter:player'), base);
  if (player !== null) {
    return {
      url: player,
      // A Twitter player is an iframe-able page, not a media file.
      type: 'text/html',
      width: toInt(meta($, 'twitter:player:width')),
      height: toInt(meta($, 'twitter:player:height')),
    };
  }

  for (const node of jsonLd) {
    if (!isObject(node) || !hasJsonLdType(node, 'VideoObject')) continue;
    const contentUrl = resolveUrl(jsonLdUrl(node['contentUrl']), base);
    const url = contentUrl ?? resolveUrl(jsonLdUrl(node['embedUrl']), base);
    if (url === null) continue;
    const dimension = (value: unknown): number | null =>
      typeof value === 'number' || typeof value === 'string' ? toInt(String(value)) : null;
    return {
      url,
      type:
        typeof node['encodingFormat'] === 'string'
          ? clean(node['encodingFormat'])
          : contentUrl === null
            ? 'text/html'
            : null,
      width: dimension(node['width']),
      height: dimension(node['height']),
    };
  }
  return null;
}

function extractAudio($: CheerioAPI, base: string): MetaAudio | null {
  const url = resolveUrl(
    meta($, 'og:audio:secure_url') ?? meta($, 'og:audio:url') ?? meta($, 'og:audio'),
    base,
  );
  return url === null ? null : { url, type: meta($, 'og:audio:type') };
}

/** Bounds on list-valued fields: a hostile page must not inflate the response. */
const MAX_KEYWORDS = 50;
const MAX_KEYWORD_LENGTH = 100;
const MAX_FEEDS = 20;
const MAX_ALTERNATES = 50;

function extractKeywords($: CheerioAPI, jsonLd: readonly unknown[]): string[] {
  const keywords: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value !== 'string') return;
    for (const part of value.split(',')) {
      const keyword = clean(part);
      if (keyword === null || keyword.length > MAX_KEYWORD_LENGTH) continue;
      const identity = keyword.toLowerCase();
      if (seen.has(identity) || keywords.length >= MAX_KEYWORDS) continue;
      seen.add(identity);
      keywords.push(keyword);
    }
  };

  add(meta($, 'keywords'));
  add(meta($, 'news_keywords'));
  $('meta[property="article:tag"]').each((_, element) => add($(element).attr('content')));
  for (const node of jsonLd) {
    if (!isObject(node)) continue;
    const declared = node['keywords'];
    if (Array.isArray(declared)) declared.forEach(add);
    else add(declared);
  }
  return keywords;
}

const FEED_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/json+feed',
]);

function extractFeeds($: CheerioAPI, base: string): MetaFeed[] {
  const feeds: MetaFeed[] = [];
  const seen = new Set<string>();
  $('link[rel][type][href]').each((_, element) => {
    const rel = ($(element).attr('rel') ?? '').toLowerCase().split(/\s+/);
    const type = ($(element).attr('type') ?? '').trim().toLowerCase();
    if (!rel.includes('alternate') || !FEED_TYPES.has(type)) return;

    const url = resolveUrl($(element).attr('href'), base);
    if (url === null || seen.has(url) || feeds.length >= MAX_FEEDS) return;
    seen.add(url);
    feeds.push({ url, title: clean($(element).attr('title')), type });
  });
  return feeds;
}

function extractAlternates($: CheerioAPI, base: string): MetaAlternate[] {
  const alternates: MetaAlternate[] = [];
  const seen = new Set<string>();
  $('link[rel][hreflang][href]').each((_, element) => {
    const rel = ($(element).attr('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('alternate')) return;
    const declared = clean($(element).attr('hreflang'));
    const lang = declared?.toLowerCase() === 'x-default' ? 'x-default' : toLanguageTag(declared);
    const url = resolveUrl($(element).attr('href'), base);
    if (lang === null || url === null || alternates.length >= MAX_ALTERNATES) return;
    const identity = `${lang} ${url}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    alternates.push({ lang, url });
  });
  return alternates;
}

/** oEmbed discovery link; the JSON flavour wins over XML. */
function extractOembed($: CheerioAPI, base: string): string | null {
  for (const type of ['application/json+oembed', 'text/json+oembed', 'text/xml+oembed', 'application/xml+oembed']) {
    const url = resolveUrl($(`link[type="${type}" i][href]`).first().attr('href'), base);
    if (url !== null) return url;
  }
  return null;
}

/** `isAccessibleForFree` of the page's own node, or of one of its parts. */
function extractPaywalled(nodes: readonly unknown[]): boolean | null {
  const read = (value: unknown): boolean | null => {
    if (typeof value === 'boolean') return !value;
    if (typeof value === 'string' && /^(?:true|false)$/i.test(value.trim())) {
      return value.trim().toLowerCase() === 'false';
    }
    return null;
  };
  for (const node of nodes) {
    if (!isObject(node)) continue;
    const own = read(node['isAccessibleForFree']);
    if (own !== null) return own;
    const parts = node['hasPart'];
    for (const part of Array.isArray(parts) ? parts : [parts]) {
      if (isObject(part) && read(part['isAccessibleForFree']) === true) return true;
    }
  }
  return null;
}

/** Host name without a leading `www.`; `null` for an unparsable URL. */
export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Extracts link-preview metadata from an HTML document.
 *
 * @param html - Raw or rendered markup.
 * @param documentUrl - Final URL of the document, used to resolve relative references.
 */
export function extractMetadata(html: string, documentUrl: string): LinkMetadata {
  const $ = load(html);
  const base = resolveUrl($('base[href]').first().attr('href'), documentUrl) ?? documentUrl;
  const jsonLd = extractJsonLd($);
  const ogType = meta($, 'og:type');
  // Scalar fields read the node that describes the page first; `jsonLd` keeps document order.
  const ranked = rankJsonLd(jsonLd, ogType);
  const primaryType = ranked.filter(isObject).flatMap(typesOf)[0] ?? null;
  const images = extractImages($, base, ranked);
  const declaredIcon = extractDeclaredIcon($, base);
  const logoUrl = extractJsonLdLogo(jsonLd, base) ?? declaredIcon;

  const articleAuthor = meta($, 'article:author');
  const twitterCreator = meta($, 'twitter:creator');

  return {
    url: documentUrl,
    canonicalUrl:
      resolveUrl($('link[rel="canonical"]').first().attr('href'), base) ??
      resolveUrl(meta($, 'og:url'), base),
    title: firstOf(
      meta($, 'og:title'),
      meta($, 'twitter:title'),
      jsonLdString(ranked, 'headline'),
      $('head > title').first().text(),
      $('title').first().text(),
      $('h1').first().text(),
    ),
    description: firstOf(
      meta($, 'og:description'),
      meta($, 'twitter:description'),
      meta($, 'description'),
      jsonLdString(ranked, 'description'),
    ),
    author: firstOf(
      meta($, 'author'),
      // `article:author` is frequently a profile URL rather than a name.
      articleAuthor !== null && !/^https?:\/\//i.test(articleAuthor) ? articleAuthor : null,
      jsonLdNamed(ranked, 'author'),
      $('[rel="author"]').first().text(),
      twitterCreator,
    ),
    publisher: firstOf(
      meta($, 'og:site_name'),
      jsonLdNamed(ranked, 'publisher'),
      meta($, 'application-name'),
    ),
    lang:
      toLanguageTag($('html').attr('lang')) ??
      toLanguageTag(meta($, 'content-language')) ??
      toLanguageTag(meta($, 'og:locale')),
    // The first candidate that is a real date wins: a junk value must not hide a good one.
    date: firstDate(
      meta($, 'article:published_time'),
      jsonLdString(ranked, 'datePublished'),
      meta($, 'datePublished'),
      meta($, 'date'),
      $('time[datetime]').first().attr('datetime'),
    ),
    dateModified: firstDate(
      meta($, 'article:modified_time'),
      meta($, 'og:updated_time'),
      jsonLdString(ranked, 'dateModified'),
      meta($, 'dateModified'),
      meta($, 'last-modified'),
    ),
    type: ogType ?? primaryType,
    themeColor: meta($, 'theme-color'),
    robots: meta($, 'robots'),
    oembed: extractOembed($, base),
    alternates: extractAlternates($, base),
    twitter: { card: meta($, 'twitter:card'), site: meta($, 'twitter:site') },
    paywalled: extractPaywalled(ranked),
    domain: domainOf(documentUrl),
    image: images[0] ?? null,
    images,
    // Browsers probe `/favicon.ico` when nothing is declared; so do we.
    favicon: declaredIcon ?? resolveUrl('/favicon.ico', base),
    logo: logoUrl === null ? null : { url: logoUrl },
    video: extractVideo($, base, jsonLd),
    audio: extractAudio($, base),
    keywords: extractKeywords($, jsonLd),
    feeds: extractFeeds($, base),
    jsonLd,
  };
}

/**
 * Decides whether statically fetched HTML is good enough, or whether the page
 * must be rendered in a browser.
 *
 * A browser render is far more expensive than an HTTP fetch, so this
 * heuristic is what keeps the service fast and cheap. Rendering is requested
 * when the preview would be poor (no title, or neither description nor image)
 * or when the document looks like an empty client-side-rendered shell.
 */
export function needsBrowserRender(metadata: LinkMetadata, html: string): boolean {
  if (metadata.title === null) return true;
  if (metadata.description === null && metadata.image === null) return true;

  const $ = load(html);
  const scripts = $('script[src]').length;
  $('script, style, noscript, template').remove();
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  const looksLikeEmptyShell = visibleText.length < 200 && scripts > 0;

  // A rich <head> on an empty <body> is still a perfectly good preview.
  return looksLikeEmptyShell && metadata.description === null;
}

/**
 * Merges two extractions field by field, preferring `primary`.
 * Used to combine a browser render with the earlier static pass.
 */
export function mergeMetadata(primary: LinkMetadata, fallback: LinkMetadata): LinkMetadata {
  return {
    url: primary.url,
    canonicalUrl: primary.canonicalUrl ?? fallback.canonicalUrl,
    title: primary.title ?? fallback.title,
    description: primary.description ?? fallback.description,
    author: primary.author ?? fallback.author,
    publisher: primary.publisher ?? fallback.publisher,
    lang: primary.lang ?? fallback.lang,
    date: primary.date ?? fallback.date,
    dateModified: primary.dateModified ?? fallback.dateModified,
    type: primary.type ?? fallback.type,
    themeColor: primary.themeColor ?? fallback.themeColor,
    robots: primary.robots ?? fallback.robots,
    oembed: primary.oembed ?? fallback.oembed,
    alternates: primary.alternates.length > 0 ? primary.alternates : fallback.alternates,
    twitter: {
      card: primary.twitter.card ?? fallback.twitter.card,
      site: primary.twitter.site ?? fallback.twitter.site,
    },
    paywalled: primary.paywalled ?? fallback.paywalled,
    domain: primary.domain ?? fallback.domain,
    image: primary.image ?? fallback.image,
    images: primary.images.length > 0 ? primary.images : fallback.images,
    favicon: primary.favicon ?? fallback.favicon,
    logo: primary.logo ?? fallback.logo,
    video: primary.video ?? fallback.video,
    audio: primary.audio ?? fallback.audio,
    keywords: primary.keywords.length > 0 ? primary.keywords : fallback.keywords,
    feeds: primary.feeds.length > 0 ? primary.feeds : fallback.feeds,
    jsonLd: primary.jsonLd.length > 0 ? primary.jsonLd : fallback.jsonLd,
  };
}
