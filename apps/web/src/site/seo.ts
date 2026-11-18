/**
 * Build-time `<head>` content: canonical and hreflang links, social cards,
 * icons, font preloads, the pre-paint boot script and JSON-LD.
 *
 * Everything stated here must be true of the product: no ratings, prices,
 * usage figures or other facts we do not have.
 */
import { escapeHtml, parseInline } from '../lib/inline.ts';
import {
  BRAND,
  LANGS,
  PUBLISHER,
  PUBLISHER_URL,
  REPO_URL,
  SITE_ORIGIN,
  UTILITY_PAGES,
  isGuide,
  localeOf,
  pagePath,
  type Lang,
  type PageId,
} from './config.ts';

/** A dictionary lookup that returns the raw (inline-syntax) string. */
export type Lookup = (key: string) => string;

/** Drops the inline markup of a dictionary string: `code` → code, [a](b) → a. */
export const plain = (source: string): string =>
  parseInline(source)
    .map((part) => part.text)
    .join('');

const absolute = (path: string): string => `${SITE_ORIGIN}${path}`;

interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

function jsonLd(page: PageId, lang: Lang, t: Lookup, faq: readonly FaqEntry[], modified: string): string {
  const url = absolute(pagePath(page, lang));
  const publisher = { '@id': `${SITE_ORIGIN}/#publisher` };
  const graph: unknown[] = [
    { '@type': 'Organization', '@id': publisher['@id'], name: PUBLISHER, url: PUBLISHER_URL },
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: BRAND,
      url: absolute(pagePath('home', lang)),
      inLanguage: lang,
      publisher,
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name: plain(t('meta.title')),
      description: plain(t('meta.description')),
      inLanguage: lang,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    },
  ];

  if (page === 'home' || page === 'docs' || page === 'playground') {
    graph.push({
      '@type': 'WebAPI',
      '@id': `${SITE_ORIGIN}/#api`,
      name: `${BRAND} API`,
      description: plain(t('footer.tagline')),
      url: absolute(pagePath('home', lang)),
      documentation: absolute(pagePath('docs', lang)),
      provider: publisher,
    });
  }
  if (page === 'home') {
    graph.push({
      '@type': 'SoftwareApplication',
      '@id': `${SITE_ORIGIN}/#software`,
      name: BRAND,
      description: plain(t('footer.tagline')),
      applicationCategory: 'DeveloperApplication',
      url: absolute(pagePath('home', lang)),
      license: 'https://spdx.org/licenses/MIT.html',
      isAccessibleForFree: true,
      sameAs: REPO_URL,
      publisher,
    });
    if (faq.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        inLanguage: lang,
        mainEntity: faq.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer },
        })),
      });
    }
  } else {
    const trail = isGuide(page) ? [{ name: plain(t('nav.guides')), item: absolute(pagePath('quickstart', lang)) }] : [];
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [{ name: plain(t('crumb.home')), item: absolute(pagePath('home', lang)) }, ...trail, { name: plain(t('title')), item: url }].map(
        (entry, at) => ({ '@type': 'ListItem', position: at + 1, name: entry.name, item: entry.item }),
      ),
    });
    if (isGuide(page) || page === 'docs') {
      graph.push({
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: plain(t('title')),
        description: plain(t('meta.description')),
        inLanguage: lang,
        dateModified: modified,
        author: publisher,
        publisher,
        mainEntityOfPage: { '@id': `${url}#page` },
      });
    }
  }

  // "<" is escaped so no string can close the script element early.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function headTags(page: PageId, lang: Lang, t: Lookup, faq: readonly FaqEntry[], modified: string): string {
  const utility = UTILITY_PAGES.includes(page);
  const url = absolute(pagePath(page, lang));
  const title = escapeHtml(plain(t('meta.title')));
  const description = escapeHtml(plain(t('meta.description')));
  const image = absolute(lang === 'fr' ? '/og-image.jpg' : `/og-image-${lang}.jpg`);
  const alternates = LANGS.map(
    (code) => `<link rel="alternate" hreflang="${code}" href="${absolute(pagePath(page, code))}" />`,
  ).join('\n    ');

  const indexing = utility
    ? '<meta name="robots" content="noindex" />'
    : `<link rel="canonical" href="${url}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${absolute(pagePath(page, 'fr'))}" />`;

  return `${indexing}
    <meta name="author" content="${PUBLISHER}" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#ffffff" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${BRAND}" />
    <meta property="og:locale" content="${localeOf(lang).og}" />
    ${LANGS.filter((code) => code !== lang).map((code) => `<meta property="og:locale:alternate" content="${localeOf(code).og}" />`).join('')}
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:alt" content="${escapeHtml(plain(t('og.alt')))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="msapplication-config" content="/browserconfig.xml" />
    <link rel="preload" href="/fonts/outfit-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/plus-jakarta-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <script src="/boot.js" vite-ignore></script>
    <script type="application/ld+json">${jsonLd(page, lang, t, faq, modified)}</script>`;
}

/** `robots.txt` and `sitemap.xml`, emitted with the build. */
export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

export function sitemapXml(pages: readonly PageId[], modified: string): string {
  const entries = pages.flatMap((page) =>
    LANGS.map((lang) => {
      const links = [
        ...LANGS.map((code) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${absolute(pagePath(page, code))}" />`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${absolute(pagePath(page, 'fr'))}" />`,
      ].join('\n');
      return `  <url>\n    <loc>${absolute(pagePath(page, lang))}</loc>\n    <lastmod>${modified.slice(0, 10)}</lastmod>\n${links}\n  </url>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}

/** RFC 9116 security contact. `expires` is one year after the build. */
export function securityTxt(modified: string): string {
  const expires = new Date(new Date(modified).getTime() + 365 * 86_400_000).toISOString();
  return `Contact: mailto:contact@kayzen-lyon.fr\nExpires: ${expires}\nPreferred-Languages: fr, en\nCanonical: ${SITE_ORIGIN}/.well-known/security.txt\nPolicy: ${absolute(pagePath('security', 'en'))}\n`;
}

export function humansTxt(modified: string): string {
  return `/* TEAM */\nDesign and development: ${PUBLISHER}\nSite: ${PUBLISHER_URL}\nLocation: Lyon, France\n\n/* SITE */\nLast update: ${modified.slice(0, 10)}\nLanguages: French, English\nStandards: HTML, CSS, TypeScript\nSoftware: Vite, Tailwind CSS, no framework\nSource: ${REPO_URL}\n`;
}
