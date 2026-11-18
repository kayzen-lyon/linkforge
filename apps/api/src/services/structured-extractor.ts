/**
 * Extraction presets: typed fields of an article, a product, a recipe or an
 * event, read from what the page declares (pure, no I/O).
 *
 * Sources are tried in order of reliability — schema.org JSON-LD, schema.org
 * microdata, Open Graph, plain `<meta>` tags, then a few CSS fallbacks — and
 * every field reports which one produced it, so a caller can tell a declared
 * price from one scraped out of a `.price` element.
 */
import { load, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

import { parseNumber } from './field-extractor.js';
import { extractMetadata, toIsoDate } from './meta-extractor.js';

export type Preset = 'article' | 'product' | 'recipe' | 'event';
export const PRESETS: readonly Preset[] = ['article', 'product', 'recipe', 'event'];

export type FieldSource = 'json-ld' | 'microdata' | 'opengraph' | 'meta' | 'css';
export type PresetValue = string | number | readonly string[] | null;

export interface PresetResult {
  readonly preset: Preset;
  /** schema.org type of the node the fields were read from; `null` when the page declares none. */
  readonly schemaType: string | null;
  readonly fields: Readonly<Record<string, PresetValue>>;
  /** Field name → where its value came from; `null` for a field that is `null`. */
  readonly sources: Readonly<Record<string, FieldSource | null>>;
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MAX_TEXT = 2000;
const MAX_LONG_TEXT = 10_000;
const MAX_ITEMS = 100;
const MAX_ITEM_TEXT = 1000;

const TYPE_PATTERNS: Readonly<Record<Preset, RegExp>> = {
  article: /^(?:\w*Article|BlogPosting|LiveBlogPosting|Report)$/,
  product: /^(?:Product|ProductGroup|IndividualProduct|Vehicle|Book)$/,
  recipe: /^Recipe$/,
  event: /^\w*Event$/,
};

const clean = (value: string, max = MAX_TEXT): string | null => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text.slice(0, max);
};

const typesOf = (node: JsonObject): string[] => {
  const declared = node['@type'];
  const list = typeof declared === 'string' ? [declared] : Array.isArray(declared) ? declared : [];
  return list.filter((type): type is string => typeof type === 'string').map((type) => type.replace(/^https?:\/\/schema\.org\//, ''));
};

/** Walks `a.b.c`, entering the first element of arrays met on the way (except at the leaf). */
function dig(node: unknown, path: string): unknown {
  let current: unknown = node;
  for (const key of path.split('.')) {
    if (Array.isArray(current)) current = current[0];
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

// --- Value readers: schema.org is loose about shapes, each reader accepts the usual ones ---

/** A name: a string, `{ name }`, or the first of a list. */
function asText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value === 'string') return clean(value, max);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return asText(value[0], max);
  if (isObject(value)) return asText(value['name'] ?? value['@value'], max);
  return null;
}

function asTexts(value: unknown): string[] | null {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const texts = list
    .slice(0, MAX_ITEMS)
    .map((item) => asText(item, MAX_ITEM_TEXT))
    .filter((item): item is string => item !== null);
  return texts.length === 0 ? null : texts;
}

/** Comma-separated keywords or a list of them. */
function asKeywords(value: unknown): string[] | null {
  const list = typeof value === 'string' ? value.split(',') : value;
  return asTexts(list);
}

function asUrl(value: unknown, base: string): string | null {
  if (Array.isArray(value)) return asUrl(value[0], base);
  if (isObject(value)) return asUrl(value['url'] ?? value['contentUrl'] ?? value['@id'], base);
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return asNumber(value[0]);
  if (isObject(value)) return asNumber(value['value'] ?? value['@value']);
  return typeof value === 'string' ? parseNumber(value) : null;
}

const asInteger = (value: unknown): number | null => {
  const number = asNumber(value);
  return number === null ? null : Math.round(number);
};

const asDate = (value: unknown): string | null => toIsoDate(asText(value));

/** A schema.org enumeration member without its namespace: `https://schema.org/InStock` → `InStock`. */
function asEnum(value: unknown): string | null {
  const text = asText(value);
  const member = text?.replace(/^https?:\/\/schema\.org\//, '') ?? null;
  return member !== null && /^[A-Za-z]{2,40}$/.test(member) ? member : null;
}

/** An ISO 8601 duration (`PT1H25M`) in whole minutes. */
function asMinutes(value: unknown): number | null {
  const match = asText(value)?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (match === null || match === undefined || match[0] === 'P') return null;
  const [, days, hours, minutes, seconds] = match;
  return Number(days ?? 0) * 1440 + Number(hours ?? 0) * 60 + Number(minutes ?? 0) + Math.round(Number(seconds ?? 0) / 60);
}

/** Recipe instructions: text, a list of `HowToStep`, or `HowToSection`s of steps. */
function asSteps(value: unknown): string[] | null {
  const steps: string[] = [];
  const visit = (item: unknown, level: number): void => {
    if (steps.length >= MAX_ITEMS || level > 3) return;
    if (typeof item === 'string') {
      const text = clean(item, MAX_ITEM_TEXT);
      if (text !== null) steps.push(text);
    } else if (Array.isArray(item)) {
      item.forEach((child) => visit(child, level + 1));
    } else if (isObject(item)) {
      if (item['itemListElement'] !== undefined) visit(item['itemListElement'], level + 1);
      else visit(item['text'] ?? item['name'], level + 1);
    }
  };
  visit(value, 0);
  return steps.length === 0 ? null : steps;
}

/** A place's address on one line. */
function asAddress(value: unknown): string | null {
  if (Array.isArray(value)) return asAddress(value[0]);
  if (!isObject(value)) return asText(value);
  const locality = [asText(value['postalCode']), asText(value['addressLocality'])].filter(Boolean).join(' ');
  const country = value['addressCountry'];
  const parts = [asText(value['streetAddress']), locality, asText(value['addressRegion']), asText(country)];
  const line = parts.filter((part) => part !== null && part !== '').join(', ');
  return line === '' ? asText(value['name']) : line;
}

// --- Microdata → the same object shape as JSON-LD ---

/** Value of an `itemprop` element, by the rules of the microdata specification. */
function microdataValue($: CheerioAPI, element: Element): unknown {
  const node = $(element);
  if (node.attr('itemscope') !== undefined) return microdataItem($, element, 1);
  const tag = element.tagName.toLowerCase();
  const attribute =
    tag === 'meta' ? 'content'
    : ['a', 'link', 'area'].includes(tag) ? 'href'
    : ['img', 'audio', 'video', 'source', 'iframe', 'embed'].includes(tag) ? 'src'
    : tag === 'time' ? 'datetime'
    : tag === 'data' || tag === 'meter' ? 'value'
    : null;
  // `content` on any element is a widespread way to give the machine value next to the visible one.
  return node.attr('content') ?? (attribute === null ? undefined : node.attr(attribute)) ?? node.text();
}

function microdataItem($: CheerioAPI, scope: Element, depth: number): JsonObject {
  const item: JsonObject = {};
  const type = $(scope).attr('itemtype')?.trim().split(/\s+/)[0];
  if (type !== undefined) item['@type'] = type.replace(/^https?:\/\/schema\.org\//, '');
  if (depth > 4) return item;
  $(scope)
    .find('[itemprop]')
    .slice(0, 500)
    .each((_, element) => {
      // Only properties of this very item: not those of an item nested in it.
      if ($(element).parentsUntil(scope, '[itemscope]').length > 0) return;
      const value = $(element).attr('itemscope') !== undefined ? microdataItem($, element, depth + 1) : microdataValue($, element);
      for (const name of ($(element).attr('itemprop') ?? '').split(/\s+/).filter(Boolean)) {
        const existing = item[name];
        if (existing === undefined) item[name] = value;
        else item[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      }
    });
  return item;
}

function microdataItems($: CheerioAPI): JsonObject[] {
  return $('[itemscope][itemtype]')
    .toArray()
    .filter((element) => $(element).attr('itemprop') === undefined)
    .slice(0, 50)
    .map((element) => microdataItem($, element, 0));
}

// --- Field tables ---

interface Context {
  readonly $: CheerioAPI;
  readonly base: string;
  /** The schema.org node of the preset's type, from JSON-LD or microdata. */
  readonly node: JsonObject | null;
  readonly nodeSource: 'json-ld' | 'microdata';
}

type Reader<T extends PresetValue> = (value: unknown, base: string) => T | null;
type Getter = readonly [source: FieldSource | 'schema', read: (context: Context) => unknown];

/** `schema('offers.price')`: a property of the schema.org node, whichever syntax declared it. */
const schema = (...paths: string[]): Getter => [
  'schema',
  ({ node }) => {
    for (const path of paths) {
      const value = dig(node, path);
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  },
];
const metaTag = (source: 'opengraph' | 'meta', ...keys: string[]): Getter => [
  source,
  ({ $ }) => {
    for (const key of keys) {
      const value = $(`meta[property="${key}" i], meta[name="${key}" i]`).first().attr('content');
      if (value !== undefined && value.trim() !== '') return value;
    }
    return undefined;
  },
];
const og = (...keys: string[]): Getter => metaTag('opengraph', ...keys);
const named = (...keys: string[]): Getter => metaTag('meta', ...keys);
const css = (selector: string, attribute?: string): Getter => [
  'css',
  ({ $ }) => {
    const element = $(selector).first();
    if (element.length === 0) return undefined;
    return attribute === undefined ? element.text() : element.attr(attribute);
  },
];
const cssAll = (selector: string): Getter => [
  'css',
  ({ $ }) => $(selector).slice(0, MAX_ITEMS).toArray().map((element) => $(element).text()),
];

type Field = readonly [name: string, read: Reader<PresetValue>, ...getters: Getter[]];

const text: Reader<string> = (value) => asText(value);
const longText: Reader<string> = (value) => asText(value, MAX_LONG_TEXT);

const FIELDS: Readonly<Record<Preset, readonly Field[]>> = {
  article: [
    ['headline', text, schema('headline', 'name'), og('og:title'), named('twitter:title'), css('article h1, main h1, h1')],
    ['description', longText, schema('description'), og('og:description'), named('description')],
    ['author', text, schema('author', 'creator'), named('author', 'article:author', 'parsely-author'), css('[rel="author"], [itemprop="author"], .author-name, .byline a')],
    ['authorUrl', asUrl, schema('author.url', 'author.sameAs'), css('a[rel="author"]', 'href')],
    ['publisher', text, schema('publisher'), og('og:site_name')],
    ['datePublished', asDate, schema('datePublished', 'dateCreated'), og('article:published_time'), named('date', 'dc.date', 'parsely-pub-date'), css('article time[datetime], main time[datetime], time[datetime]', 'datetime')],
    ['dateModified', asDate, schema('dateModified'), og('article:modified_time', 'og:updated_time')],
    ['image', asUrl, schema('image', 'thumbnailUrl'), og('og:image', 'og:image:url'), named('twitter:image')],
    ['section', text, schema('articleSection'), og('article:section')],
    ['keywords', asKeywords, schema('keywords'), named('keywords', 'news_keywords')],
    ['language', text, schema('inLanguage'), css('html', 'lang')],
    ['wordCount', asInteger, schema('wordCount')],
    ['url', asUrl, schema('mainEntityOfPage', 'url'), css('link[rel="canonical"]', 'href'), og('og:url')],
  ],
  product: [
    ['name', text, schema('name'), og('og:title'), css('h1')],
    ['description', longText, schema('description'), og('og:description'), named('description')],
    ['brand', text, schema('brand', 'manufacturer'), og('product:brand')],
    ['sku', text, schema('sku', 'mpn', 'productID'), og('product:retailer_item_id')],
    ['gtin', text, schema('gtin13', 'gtin', 'gtin14', 'gtin12', 'gtin8', 'isbn')],
    ['image', asUrl, schema('image'), og('og:image', 'og:image:url')],
    ['price', asNumber, schema('offers.price', 'offers.lowPrice', 'offers.priceSpecification.price'), og('product:price:amount', 'og:price:amount'), css('[itemprop="price"], .price .amount, .product-price, .price')],
    ['currency', text, schema('offers.priceCurrency', 'offers.priceSpecification.priceCurrency'), og('product:price:currency', 'og:price:currency')],
    ['availability', asEnum, schema('offers.availability'), og('product:availability', 'og:availability')],
    ['condition', asEnum, schema('offers.itemCondition', 'itemCondition'), og('product:condition')],
    ['ratingValue', asNumber, schema('aggregateRating.ratingValue')],
    ['reviewCount', asInteger, schema('aggregateRating.reviewCount', 'aggregateRating.ratingCount')],
    ['seller', text, schema('offers.seller')],
    ['url', asUrl, schema('offers.url', 'url'), css('link[rel="canonical"]', 'href'), og('og:url')],
  ],
  recipe: [
    ['name', text, schema('name', 'headline'), og('og:title'), css('h1')],
    ['description', longText, schema('description'), og('og:description'), named('description')],
    ['author', text, schema('author'), named('author')],
    ['image', asUrl, schema('image'), og('og:image')],
    ['datePublished', asDate, schema('datePublished')],
    ['prepMinutes', asMinutes, schema('prepTime')],
    ['cookMinutes', asMinutes, schema('cookTime')],
    ['totalMinutes', asMinutes, schema('totalTime')],
    ['yield', text, schema('recipeYield')],
    ['category', text, schema('recipeCategory')],
    ['cuisine', text, schema('recipeCuisine')],
    ['calories', text, schema('nutrition.calories')],
    ['ingredients', asTexts, schema('recipeIngredient', 'ingredients'), cssAll('[itemprop="recipeIngredient"], .recipe-ingredients li, .ingredients li')],
    ['instructions', asSteps, schema('recipeInstructions'), cssAll('[itemprop="recipeInstructions"] li, .recipe-instructions li, .instructions li')],
    ['keywords', asKeywords, schema('keywords')],
    ['ratingValue', asNumber, schema('aggregateRating.ratingValue')],
    ['ratingCount', asInteger, schema('aggregateRating.ratingCount', 'aggregateRating.reviewCount')],
  ],
  event: [
    ['name', text, schema('name'), og('og:title'), css('h1')],
    ['description', longText, schema('description'), og('og:description'), named('description')],
    ['startDate', asDate, schema('startDate'), og('event:start_time'), css('time[datetime]', 'datetime')],
    ['endDate', asDate, schema('endDate'), og('event:end_time')],
    ['status', asEnum, schema('eventStatus')],
    ['attendanceMode', asEnum, schema('eventAttendanceMode')],
    ['locationName', text, schema('location')],
    ['address', asAddress, schema('location.address')],
    ['image', asUrl, schema('image'), og('og:image')],
    ['organizer', text, schema('organizer')],
    ['performers', asTexts, schema('performer', 'performers')],
    ['price', asNumber, schema('offers.price', 'offers.lowPrice')],
    ['currency', text, schema('offers.priceCurrency')],
    ['availability', asEnum, schema('offers.availability')],
    ['url', asUrl, schema('url', 'offers.url'), css('link[rel="canonical"]', 'href'), og('og:url')],
  ],
};

/** Fields without which the answer is not worth much: their absence triggers a browser render in `auto`. */
const KEY_FIELDS: Readonly<Record<Preset, readonly string[]>> = {
  article: ['headline', 'datePublished'],
  product: ['name', 'price'],
  recipe: ['name', 'ingredients'],
  event: ['name', 'startDate'],
};

/** Names of the fields of a preset, in order (for documentation). */
export function presetFieldNames(preset: Preset): string[] {
  return FIELDS[preset].map(([name]) => name);
}

/** Finds the node of the preset's type, also one level down (`mainEntity`, `@graph` is already flat). */
function findNode(nodes: readonly unknown[], pattern: RegExp): JsonObject | null {
  const matches = (node: unknown): node is JsonObject => isObject(node) && typesOf(node).some((type) => pattern.test(type));
  for (const node of nodes) {
    if (matches(node)) return node;
  }
  for (const node of nodes) {
    if (!isObject(node)) continue;
    for (const key of ['mainEntity', 'mainEntityOfPage', 'about']) {
      const nested = Array.isArray(node[key]) ? (node[key] as unknown[])[0] : node[key];
      if (matches(nested)) return nested;
    }
  }
  return null;
}

/**
 * Reads the fields of `preset` from a document.
 *
 * @param documentUrl - Final URL of the document; relative URLs are resolved against it.
 */
export function extractPreset(html: string, documentUrl: string, preset: Preset): PresetResult {
  const $ = load(html);
  const pattern = TYPE_PATTERNS[preset];
  const fromJsonLd = findNode(extractMetadata(html, documentUrl).jsonLd, pattern);
  const node = fromJsonLd ?? findNode(microdataItems($), pattern);
  const context: Context = { $, base: documentUrl, node, nodeSource: fromJsonLd !== null ? 'json-ld' : 'microdata' };

  const fields: Record<string, PresetValue> = {};
  const sources: Record<string, FieldSource | null> = {};
  for (const [name, read, ...getters] of FIELDS[preset]) {
    fields[name] = null;
    sources[name] = null;
    for (const [source, get] of getters) {
      if (source === 'schema' && node === null) continue;
      const value = read(get(context), documentUrl);
      if (value === null || (Array.isArray(value) && value.length === 0)) continue;
      fields[name] = value;
      sources[name] = source === 'schema' ? context.nodeSource : source;
      break;
    }
  }
  return { preset, schemaType: node === null ? null : (typesOf(node)[0] ?? null), fields, sources };
}

/** True when a key field of the preset is missing: the static markup may not be the whole page. */
export function presetIsIncomplete(result: PresetResult): boolean {
  return KEY_FIELDS[result.preset].some((name) => result.fields[name] === null);
}
