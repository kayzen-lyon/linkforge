/**
 * Pure HTML → readable content extraction (no I/O), made for LLMs and agents:
 * the main text of a page without its navigation, ads and chrome.
 */
import { load, type CheerioAPI } from 'cheerio';

import { nodesToMarkdown, type DomNode } from '../lib/html-to-markdown.js';
import { extractMetadata } from './meta-extractor.js';

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
}

/** Everything that is page chrome rather than content. */
const NOISE = [
  'script', 'style', 'noscript', 'template', 'nav', 'aside', 'footer', 'form', 'iframe', 'svg',
  'canvas', 'button', 'select', 'dialog', '[hidden]', '[aria-hidden="true"]',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
  '[role="search"]', 'body > header',
].join(', ');

/** Explicit markers of the main content, as authors declare them. */
const LANDMARKS = 'article, main, [role="main"], [itemprop="articleBody"]';

/** Below this many characters a candidate is not considered real content. */
const MIN_CONTENT_CHARS = 140;
/** A nested landmark holding this share of its parent's text is the better pick. */
const DOMINANCE = 0.7;
/** Caps on `text` and `markdown`, so one huge page cannot produce a multi-megabyte answer. */
const MAX_OUTPUT_CHARS = 500_000;
const EXCERPT_CHARS = 280;
const WORDS_PER_MINUTE = 200;
/** Same guard as the Markdown converter: do not recurse into absurdly deep trees. */
const MAX_DEPTH = 200;

const LINE_BREAKERS = new Set(['br', 'li', 'tr', 'dt', 'dd']);
const PARAGRAPH_BREAKERS = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'figure', 'figcaption', 'blockquote', 'pre',
  'ul', 'ol', 'dl', 'table', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'details', 'summary',
]);

/** Plain text of a subtree with block boundaries turned into line breaks. */
function toPlainText(root: DomNode): string {
  const parts: string[] = [];
  const visit = (node: DomNode, depth: number, preformatted: boolean): void => {
    if (node.type === 'text') {
      parts.push(preformatted ? (node.data ?? '') : (node.data ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (node.type !== 'tag' || depth > MAX_DEPTH) return;
    const name = node.name ?? '';
    const separator = PARAGRAPH_BREAKERS.has(name) ? '\n\n' : LINE_BREAKERS.has(name) ? '\n' : '';
    parts.push(separator);
    for (const child of node.children ?? []) visit(child, depth + 1, preformatted || name === 'pre');
    parts.push(separator);
  };
  visit(root, 0, false);

  return parts
    .join('')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Length of a text once its whitespace is collapsed. */
const visibleLength = (text: string): number => text.replace(/\s+/g, ' ').trim().length;

/**
 * Picks the element holding the main content.
 *
 * 1. Authors' landmarks (`<article>`, `<main>`...): the one with the most
 *    text, narrowed to a nested landmark when that one holds most of it
 *    (`<main>` wrapping a single `<article>` plus related links).
 * 2. Otherwise the densest block: the container whose own paragraphs carry
 *    the most text, which is where prose lives on pages without landmarks.
 * 3. Otherwise the whole `<body>`.
 */
function pickMainNode($: CheerioAPI): DomNode | null {
  const landmarks = $(LANDMARKS)
    .toArray()
    .map((node) => ({ node, length: visibleLength($(node).text()) }))
    .sort((a, b) => b.length - a.length);

  let best = landmarks[0];
  if (best !== undefined && best.length >= MIN_CONTENT_CHARS) {
    for (const candidate of landmarks.slice(1)) {
      const nested = $(candidate.node).closest($(best.node)).length > 0;
      if (nested && candidate.length >= best.length * DOMINANCE) best = candidate;
    }
    return best.node;
  }

  let densest: { node: DomNode; score: number } | null = null;
  $('body, div, section, td').each((_, node) => {
    let score = 0;
    $(node)
      .children('p')
      .each((__, paragraph) => {
        score += visibleLength($(paragraph).text());
      });
    if (densest === null || score > densest.score) densest = { node, score };
  });
  const picked = densest as { node: DomNode; score: number } | null;
  if (picked !== null && picked.score >= MIN_CONTENT_CHARS) return picked.node;

  return $('body').get(0) ?? null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // Prefer ending on a word boundary when one is close.
  const boundary = cut.lastIndexOf(' ');
  return `${cut.slice(0, boundary > max - 40 ? boundary : max).trimEnd()}…`;
}

/**
 * Extracts the readable content of an HTML document.
 *
 * @param html - Raw or rendered markup.
 * @param documentUrl - Final URL of the document, used to resolve relative links.
 */
export function extractContent(html: string, documentUrl: string): ReadableContent {
  // Read before the tree is pruned: the description lives in <head>.
  const metadata = extractMetadata(html, documentUrl);

  const $ = load(html);
  const baseHref = $('base[href]').first().attr('href');
  const baseUrl = URL.canParse(baseHref ?? '', documentUrl)
    ? new URL(baseHref ?? '', documentUrl).href
    : documentUrl;
  $(NOISE).remove();

  const main = pickMainNode($);
  const text = main === null ? '' : truncate(toPlainText(main), MAX_OUTPUT_CHARS);
  const markdown =
    main === null ? '' : truncate(nodesToMarkdown([main], { baseUrl }), MAX_OUTPUT_CHARS);
  const wordCount = text === '' ? 0 : text.split(/\s+/).length;

  return {
    url: documentUrl,
    title: metadata.title,
    lang: metadata.lang,
    excerpt:
      metadata.description ??
      (text === '' ? null : truncate(text.replace(/\s+/g, ' '), EXCERPT_CHARS)),
    text,
    markdown,
    wordCount,
    readingTimeMinutes: Math.ceil(wordCount / WORDS_PER_MINUTE),
  };
}
