/**
 * Pure HTML → readable content extraction (no I/O), made for LLMs and agents:
 * the main text of a page without its navigation, ads and chrome.
 */
import { load, type CheerioAPI } from 'cheerio';

import { AppError } from '../lib/errors.js';
import { convertNodes, type DomNode } from '../lib/html-to-markdown.js';
import { parseSelectorList } from '../lib/selectors.js';
import { domainOf, extractMetadata } from './meta-extractor.js';

export interface ContentLink {
  /** Absolute URL. */
  readonly url: string;
  /** Visible text of the link. */
  readonly text: string;
  /** True when the link stays on the page's own site (same host, `www.` ignored). */
  readonly internal: boolean;
}

export interface ContentImage {
  /** Absolute URL of the largest rendition the page offers. */
  readonly url: string;
  readonly alt: string;
}

export interface ReadableContent {
  /** Final URL of the document (after redirects). */
  readonly url: string;
  readonly title: string | null;
  /** BCP 47 language tag declared by the document. */
  readonly lang: string | null;
  /** Declared description, else the beginning of the text. */
  readonly excerpt: string | null;
  /** Main content as plain text, one block per paragraph. */
  readonly text: string;
  /** Main content as Markdown. */
  readonly markdown: string;
  readonly wordCount: number;
  /** At 200 words per minute, rounded up. */
  readonly readingTimeMinutes: number;
  /** True when `text` or `markdown` was cut at the size cap. */
  readonly truncated: boolean;
  /** Links of the extracted content, de-duplicated, in document order. */
  readonly links: readonly ContentLink[];
  /** Images of the extracted content, de-duplicated, in document order. */
  readonly images: readonly ContentImage[];
}

export interface ContentOptions {
  /** When false the whole `<body>` is kept (scripts and styles aside) instead of the main content. */
  readonly mainContent?: boolean;
  /** Keep only the elements matching these CSS selectors (document order). */
  readonly include?: readonly string[];
  /** Remove the elements matching these CSS selectors. */
  readonly exclude?: readonly string[];
  /** Reference-style links in `markdown`. */
  readonly citations?: boolean;
}

/** Never content, whatever the options. */
const INERT = 'script, style, noscript, template';

/** Everything that is page chrome rather than content. */
const NOISE = [
  'nav', 'aside', 'footer', 'form', 'iframe', 'svg', 'canvas', 'button', 'select', 'dialog',
  '[hidden]', '[aria-hidden="true"]', '[role="navigation"]', '[role="banner"]',
  '[role="contentinfo"]', '[role="complementary"]', '[role="search"]', '[role="dialog"]',
  '[role="alertdialog"]', 'body > header',
].join(', ');

/**
 * Words that mark an element as page furniture when they appear as a whole
 * token of its `class` or `id` (`site-footer`, `shareButtons`, `cookie_notice`).
 */
const NOISE_WORDS = new Set([
  'sidebar', 'breadcrumb', 'breadcrumbs', 'cookie', 'cookies', 'consent', 'gdpr', 'newsletter',
  'subscribe', 'subscription', 'paywall', 'share', 'sharing', 'social', 'related', 'recommended',
  'comments', 'disqus', 'advert', 'advertisement', 'ads', 'adslot', 'sponsor', 'sponsored',
  'promo', 'popup', 'modal', 'overlay', 'toolbar', 'pagination', 'pager', 'skip', 'masthead',
  'navbar', 'topbar', 'menu', 'offcanvas', 'footer', 'widget', 'toc', 'outbrain', 'taboola',
]);
/** Two-word markers, matched on adjacent tokens. */
const NOISE_PAIRS = new Set(['sr only', 'visually hidden', 'screen reader', 'back top', 'read more']);

/** Explicit markers of the main content, as authors declare them. */
const LANDMARKS = 'article, main, [role="main"], [itemprop="articleBody"]';

/** Below this many characters a candidate is not considered real content. */
const MIN_CONTENT_CHARS = 140;
/** A nested landmark holding this share of its parent's text is the better pick. */
const DOMINANCE = 0.7;
/** An element holding this share of the page's text is never removed as noise. */
const PROTECTED_SHARE = 0.5;
/** Caps on `text` and `markdown`, so one huge page cannot produce a multi-megabyte answer. */
const MAX_OUTPUT_CHARS = 500_000;
const MAX_LINKS = 500;
const MAX_IMAGES = 200;
const EXCERPT_CHARS = 280;
const WORDS_PER_MINUTE = 200;
/** Same guard as the Markdown converter: do not recurse into absurdly deep trees. */
const MAX_DEPTH = 200;

const LINE_BREAKERS = new Set(['br', 'li', 'tr', 'dt', 'dd']);
const PARAGRAPH_BREAKERS = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'figure', 'figcaption', 'blockquote', 'pre',
  'ul', 'ol', 'dl', 'table', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'details', 'summary',
  'form', 'fieldset',
]);

/**
 * Plain text of a subtree, with block boundaries turned into line breaks:
 * a blank line between paragraphs, a single break between list items and rows.
 */
function toPlainText(roots: readonly DomNode[]): string {
  let out = '';
  /** Strongest break requested since the last text: 0 none, 1 line, 2 paragraph. */
  let pending = 0;

  const append = (text: string, preformatted: boolean): void => {
    if (!preformatted && text.trim() === '') {
      // Whitespace between inline elements is a word boundary; between blocks it is nothing.
      if (pending === 0 && out !== '' && !/\s$/.test(out)) out += ' ';
      return;
    }
    if (pending > 0 && out !== '') out = `${out.trimEnd()}${pending === 2 ? '\n\n' : '\n'}`;
    const startsLine = out === '' || out.endsWith('\n');
    pending = 0;
    out += startsLine && !preformatted ? text.trimStart() : text;
  };

  const visit = (node: DomNode, depth: number, preformatted: boolean): void => {
    if (node.type === 'text') {
      const data = node.data ?? '';
      append(preformatted ? data : data.replace(/\s+/g, ' '), preformatted);
      return;
    }
    if (node.type !== 'tag' || depth > MAX_DEPTH) return;
    const name = node.name ?? '';
    const level = PARAGRAPH_BREAKERS.has(name) ? 2 : LINE_BREAKERS.has(name) ? 1 : 0;
    pending = Math.max(pending, level);
    for (const child of node.children ?? []) visit(child, depth + 1, preformatted || name === 'pre');
    pending = Math.max(pending, level);
  };
  for (const root of roots) {
    pending = Math.max(pending, 2);
    visit(root, 0, false);
  }

  return out.replace(/ {2,}/g, ' ').trim();
}

/** Length of a text once its whitespace is collapsed. */
const visibleLength = (text: string): number => text.replace(/\s+/g, ' ').trim().length;

/**
 * Counts words in any script.
 *
 * Splitting on whitespace counts a whole Chinese or Japanese page as a
 * handful of "words"; `Intl.Segmenter` applies the dictionary-based word
 * breaking those scripts need.
 */
export function countWords(text: string, lang: string | null): number {
  if (text === '') return 0;
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(lang ?? undefined, { granularity: 'word' });
  } catch {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  }
  let count = 0;
  for (const segment of segmenter.segment(text)) if (segment.isWordLike === true) count += 1;
  return count;
}

/** Tells whether a `class` or `id` value names page furniture. */
function namesNoise(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  // `siteFooter`, `site-footer`, `site_footer` → site footer
  const tokens = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== '');
  return tokens.some(
    (token, index) =>
      NOISE_WORDS.has(token) || NOISE_PAIRS.has(`${token} ${tokens[index + 1] ?? ''}`),
  );
}

/**
 * Removes page furniture, with one safeguard: an element that holds most of
 * the page's text is content whatever its tag or class says. That is what
 * keeps ASP.NET WebForms pages (the whole body sits in one `<form>`), pages
 * wrapped in `<dialog open>` and mis-flagged `aria-hidden` wrappers readable.
 */
function removeNoise($: CheerioAPI): void {
  const total = visibleLength($('body').text());
  const isProtected = (node: DomNode): boolean => {
    if (total === 0) return false;
    const element = $(node as never);
    if (element.is('body, html')) return true;
    return visibleLength(element.text()) >= total * PROTECTED_SHARE;
  };

  $(NOISE).each((_, node) => {
    if (!isProtected(node)) $(node).remove();
  });
  $('[class], [id]').each((_, node) => {
    const element = $(node);
    // Authors' landmarks outrank a guess made from a class name.
    if (element.is(LANDMARKS) || element.find(LANDMARKS).length > 0) return;
    if (!namesNoise(element.attr('class')) && !namesNoise(element.attr('id'))) return;
    if (!isProtected(node)) element.remove();
  });
}

/**
 * Picks the element(s) holding the main content.
 *
 * 1. Authors' landmarks (`<article>`, `<main>`...): the one with the most
 *    text, narrowed to a nested landmark when that one holds most of it
 *    (`<main>` wrapping a single `<article>` plus related links). When the
 *    page is a list of sibling `<article>`s (blog index, feed, forum thread)
 *    and none dominates, all of them are kept, in document order.
 * 2. Otherwise the densest block: the container whose own paragraphs carry
 *    the most text, which is where prose lives on pages without landmarks.
 * 3. Otherwise the whole `<body>`.
 */
function pickMainNodes($: CheerioAPI): DomNode[] {
  const landmarks = $(LANDMARKS)
    .toArray()
    .map((node) => ({ node, length: visibleLength($(node).text()) }));
  const bySize = [...landmarks].sort((a, b) => b.length - a.length);

  let best = bySize[0];
  if (best !== undefined && best.length >= MIN_CONTENT_CHARS) {
    for (const candidate of bySize.slice(1)) {
      const nested = $(candidate.node).closest($(best.node)).length > 0;
      if (nested && candidate.length >= best.length * DOMINANCE) best = candidate;
    }
    const picked = best.node;
    // Landmarks that neither contain nor sit inside the pick: its peers.
    const peers = landmarks.filter(
      ({ node, length }) =>
        length > 0 &&
        (node === picked ||
          ($(node).closest($(picked)).length === 0 && $(picked).closest($(node)).length === 0)),
    );
    const outermost = peers.filter(
      ({ node }) => !peers.some((other) => other.node !== node && $(node).closest($(other.node)).length > 0),
    );
    const combined = outermost.reduce((sum, peer) => sum + peer.length, 0);
    if (outermost.length > 1 && best.length < combined * DOMINANCE) {
      return outermost.map((peer) => peer.node);
    }
    return [picked];
  }

  let densest: { node: DomNode; score: number } | null = null;
  $('body, div, section, td, form').each((_, node) => {
    let score = 0;
    $(node)
      .children('p')
      .each((__, paragraph) => {
        score += visibleLength($(paragraph).text());
      });
    if (densest === null || score > densest.score) densest = { node, score };
  });
  const picked = densest as { node: DomNode; score: number } | null;
  if (picked !== null && picked.score >= MIN_CONTENT_CHARS) return [picked.node];

  return $('body').toArray();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // Prefer ending on a word boundary when one is close.
  const boundary = cut.lastIndexOf(' ');
  return `${cut.slice(0, boundary > max - 40 ? boundary : max).trimEnd()}…`;
}

/**
 * Parses and validates the `include` / `exclude` parameters.
 *
 * @throws {AppError} `EINVALIDPARAMS` when a selector is refused or is not valid CSS.
 */
export function parseContentSelectors(raw: string | null, name: string): string[] {
  if (raw === null) return [];
  const selectors = parseSelectorList(raw, name);
  const probe = load('');
  for (const selector of selectors) {
    try {
      probe(selector);
    } catch {
      throw AppError.invalidParams(`${name}: "${selector}" is not a valid CSS selector`);
    }
  }
  return selectors;
}

/** Outermost matches of `selectors`, in document order. */
function selectOutermost($: CheerioAPI, selectors: readonly string[]): DomNode[] {
  const matched = $(selectors.join(', ')).toArray();
  const set = new Set<unknown>(matched);
  return matched.filter((node) => {
    for (let parent = node.parent; parent !== null; parent = parent.parent) {
      if (set.has(parent)) return false;
    }
    return true;
  });
}

/**
 * Extracts the readable content of an HTML document.
 *
 * @param html - Raw or rendered markup.
 * @param documentUrl - Final URL of the document, used to resolve relative links.
 */
export function extractContent(
  html: string,
  documentUrl: string,
  options: ContentOptions = {},
): ReadableContent {
  // Read before the tree is pruned: the description lives in <head>.
  const metadata = extractMetadata(html, documentUrl);
  const mainContent = options.mainContent ?? true;
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];

  const prepare = (clean: boolean): { $: CheerioAPI; nodes: DomNode[] } => {
    const $ = load(html);
    $(INERT).remove();
    if (exclude.length > 0) $(exclude.join(', ')).remove();
    if (include.length > 0) {
      // The client chose the content: no heuristic may second-guess it.
      return { $, nodes: selectOutermost($, include) };
    }
    if (!clean) return { $, nodes: $('body').toArray() };
    removeNoise($);
    return { $, nodes: pickMainNodes($) };
  };

  let { $, nodes } = prepare(mainContent);
  let text = toPlainText(nodes);
  // Over-eager cleaning must never turn a page with text into an empty answer.
  if (text === '' && mainContent && include.length === 0) {
    ({ $, nodes } = prepare(false));
    text = toPlainText(nodes);
  }

  const baseHref = $('base[href]').first().attr('href');
  const baseUrl = URL.canParse(baseHref ?? '', documentUrl)
    ? new URL(baseHref ?? '', documentUrl).href
    : documentUrl;
  const converted = convertNodes(nodes, { baseUrl, citations: options.citations ?? false });

  const truncated = text.length > MAX_OUTPUT_CHARS || converted.markdown.length > MAX_OUTPUT_CHARS;
  text = truncate(text, MAX_OUTPUT_CHARS);
  const wordCount = countWords(text, metadata.lang);
  const site = domainOf(documentUrl);

  return {
    url: documentUrl,
    title: metadata.title,
    lang: metadata.lang,
    excerpt:
      metadata.description ??
      (text === '' ? null : truncate(text.replace(/\s+/g, ' '), EXCERPT_CHARS)),
    text,
    markdown: truncate(converted.markdown, MAX_OUTPUT_CHARS),
    wordCount,
    readingTimeMinutes: Math.ceil(wordCount / WORDS_PER_MINUTE),
    truncated,
    links: converted.links
      .slice(0, MAX_LINKS)
      .map((link) => ({ ...link, internal: domainOf(link.url) === site })),
    images: converted.images.slice(0, MAX_IMAGES),
  };
}
