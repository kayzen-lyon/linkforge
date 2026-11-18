/**
 * Pure HTML → list of links (no I/O).
 */
import { load } from 'cheerio';

import { domainOf } from './meta-extractor.js';

export interface PageLink {
  /** Absolute http(s) URL, fragment removed. */
  readonly url: string;
  /** Visible text of the first occurrence, else its `title` or image `alt`. */
  readonly text: string;
  /** Tokens of the `rel` attribute, lower-cased (`nofollow`, `sponsored`, `ugc`, `noopener`...). */
  readonly rel: readonly string[];
  /** True when the link stays on the page's own host (`www.` ignored). */
  readonly internal: boolean;
  /** True when `rel` asks crawlers not to follow (`nofollow`, `sponsored` or `ugc`). */
  readonly nofollow: boolean;
}

export interface PageLinks {
  /** Distinct links found, before `scope` and `limit` are applied. */
  readonly total: number;
  readonly internal: number;
  readonly external: number;
  readonly links: readonly PageLink[];
  /** True when more links matched than `limit` allowed. */
  readonly truncated: boolean;
}

export type LinkScope = 'all' | 'internal' | 'external';

const MAX_TEXT = 200;
/** Links examined at most, so a hostile page cannot make the scan unbounded. */
const MAX_SCANNED = 20_000;

/**
 * Lists the `<a href>` links of a document: absolute, de-duplicated (the
 * fragment is ignored), in document order.
 */
export function extractLinks(
  html: string,
  documentUrl: string,
  scope: LinkScope,
  limit: number,
): PageLinks {
  const $ = load(html);
  const baseHref = $('base[href]').first().attr('href') ?? '';
  const base = URL.canParse(baseHref, documentUrl) ? new URL(baseHref, documentUrl).href : documentUrl;
  const site = domainOf(documentUrl);
  const found = new Map<string, PageLink>();

  $('a[href]')
    .slice(0, MAX_SCANNED)
    .each((_, element) => {
      const anchor = $(element);
      const href = (anchor.attr('href') ?? '').trim();
      if (href === '' || !URL.canParse(href, base)) return;
      const url = new URL(href, base);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      url.hash = '';
      if (found.has(url.href)) return;

      const rel = (anchor.attr('rel') ?? '').toLowerCase().split(/\s+/).filter((token) => token !== '');
      const text =
        anchor.text().replace(/\s+/g, ' ').trim() ||
        (anchor.attr('title') ?? anchor.find('img[alt]').first().attr('alt') ?? '').trim();
      found.set(url.href, {
        url: url.href,
        text: text.slice(0, MAX_TEXT),
        rel,
        internal: domainOf(url.href) === site,
        nofollow: rel.some((token) => token === 'nofollow' || token === 'sponsored' || token === 'ugc'),
      });
    });

  const all = [...found.values()];
  const internal = all.filter((link) => link.internal).length;
  const wanted = scope === 'all' ? all : all.filter((link) => link.internal === (scope === 'internal'));
  return {
    total: all.length,
    internal,
    external: all.length - internal,
    links: wanted.slice(0, limit),
    truncated: wanted.length > limit,
  };
}
