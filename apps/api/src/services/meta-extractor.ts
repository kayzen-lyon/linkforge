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

/** Picks the best declared icon (largest size wins), defaulting to `/favicon.ico`. */
function extractFavicon($: CheerioAPI, base: string): string | null {
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
  return picked?.url ?? resolveUrl('/favicon.ico', base);
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
    favicon: extractFavicon($, base),
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
    jsonLd: primary.jsonLd.length > 0 ? primary.jsonLd : fallback.jsonLd,
  };
}
