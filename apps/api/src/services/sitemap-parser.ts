/**
 * Pure parsers for `robots.txt` and sitemap files (no I/O).
 */
import { load } from 'cheerio';

export interface SitemapUrl {
  readonly url: string;
  /** `<lastmod>` as declared (W3C datetime), `null` when absent. */
  readonly lastmod: string | null;
}

export interface ParsedSitemap {
  readonly kind: 'index' | 'urlset' | 'unknown';
  /** Child sitemaps of an index file. */
  readonly sitemaps: readonly string[];
  /** Number of `<url>` entries in the file. */
  readonly urlCount: number;
  /** At most `limit` of them. */
  readonly urls: readonly SitemapUrl[];
}

const httpUrl = (value: string, base?: string): string | null => {
  const text = value.trim();
  if (!URL.canParse(text, base)) return null;
  const url = new URL(text, base);
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
};

/** `Sitemap:` directives of a robots.txt, absolute and de-duplicated (at most `max`). */
export function parseRobotsSitemaps(robots: string, baseUrl: string, max: number): string[] {
  const found = new Set<string>();
  for (const line of robots.split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    const url = match?.[1] === undefined ? null : httpUrl(match[1], baseUrl);
    if (url !== null && found.size < max) found.add(url);
  }
  return [...found];
}

/** Parses a sitemap or sitemap-index document, keeping at most `limit` URLs. */
export function parseSitemap(xml: string, limit: number): ParsedSitemap {
  const $ = load(xml, { xml: true });
  const sitemaps = $('sitemapindex > sitemap > loc')
    .toArray()
    .map((node) => httpUrl($(node).text()))
    .filter((url): url is string => url !== null);
  if ($('sitemapindex').length > 0) return { kind: 'index', sitemaps, urlCount: 0, urls: [] };

  const entries = $('urlset > url');
  const urls: SitemapUrl[] = [];
  entries.slice(0, limit).each((_, node) => {
    const url = httpUrl($(node).children('loc').first().text());
    if (url === null) return;
    const lastmod = $(node).children('lastmod').first().text().trim();
    urls.push({ url, lastmod: lastmod === '' ? null : lastmod.slice(0, 40) });
  });
  return {
    kind: $('urlset').length > 0 ? 'urlset' : 'unknown',
    sitemaps: [],
    urlCount: entries.length,
    urls,
  };
}
