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

function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toIsoDate(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Reads `<meta property|name|itemprop="key" content="...">`. */
function meta($: CheerioAPI, key: string): string | null {
  const selector = `meta[property="${key}"], meta[name="${key}"], meta[itemprop="${key}"]`;
  return clean($(selector).first().attr('content'));
}

/** Parses every JSON-LD block, tolerating invalid JSON, and flattens `@graph`. */
function extractJsonLd($: CheerioAPI): unknown[] {
  const nodes: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
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

/** Reads a name out of a JSON-LD value that may be a string, an object or a list. */
function jsonLdName(value: unknown): string | null {
  if (typeof value === 'string') return clean(value);
  if (Array.isArray(value)) return jsonLdName(value[0]);
  if (isObject(value) && typeof value['name'] === 'string') return clean(value['name']);
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

  $('meta[property^="og:image"]').each((_, element) => {
    const property = $(element).attr('property');
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

const hasJsonLdType = (node: JsonObject, type: string): boolean => {
  const declared = node['@type'];
  return declared === type || (Array.isArray(declared) && declared.includes(type));
};

function extractVideo($: CheerioAPI, base: string, jsonLd: readonly unknown[]): MetaVideo | null {
  const ogUrl = resolveUrl(
    meta($, 'og:video:secure_url') ?? meta($, 'og:video:url') ?? meta($, 'og:video'),
    base,
  );
  if (ogUrl !== null) {
    return {
      url: ogUrl,
      type: meta($, 'og:video:type'),
      width: toInt(meta($, 'og:video:width') ?? undefined),
      height: toInt(meta($, 'og:video:height') ?? undefined),
    };
  }

  const player = resolveUrl(meta($, 'twitter:player'), base);
  if (player !== null) {
    return {
      url: player,
      // A Twitter player is an iframe-able page, not a media file.
      type: 'text/html',
      width: toInt(meta($, 'twitter:player:width') ?? undefined),
      height: toInt(meta($, 'twitter:player:height') ?? undefined),
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
  const images = extractImages($, base, jsonLd);
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
      jsonLdString(jsonLd, 'headline'),
      $('head > title').first().text(),
      $('title').first().text(),
      $('h1').first().text(),
    ),
    description: firstOf(
      meta($, 'og:description'),
      meta($, 'twitter:description'),
      meta($, 'description'),
      jsonLdString(jsonLd, 'description'),
    ),
    author: firstOf(
      meta($, 'author'),
      // `article:author` is frequently a profile URL rather than a name.
      articleAuthor !== null && !/^https?:\/\//i.test(articleAuthor) ? articleAuthor : null,
      jsonLdNamed(jsonLd, 'author'),
      $('[rel="author"]').first().text(),
      twitterCreator,
    ),
    publisher: firstOf(
      meta($, 'og:site_name'),
      jsonLdNamed(jsonLd, 'publisher'),
      meta($, 'application-name'),
    ),
    lang: firstOf($('html').attr('lang'), meta($, 'og:locale')),
    date: toIsoDate(
      firstOf(
        meta($, 'article:published_time'),
        jsonLdString(jsonLd, 'datePublished'),
        meta($, 'date'),
        $('time[datetime]').first().attr('datetime'),
      ),
    ),
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
