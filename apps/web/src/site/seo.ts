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
  STORAGE,
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

/**
 * Runs before first paint, so nothing flashes:
 *  - a visitor who chose the other language is sent to that language's URL
 *    (unless they are navigating inside the site, where the URL decides);
 *  - the theme (stored choice, else the system setting) and the accessibility
 *    options are applied to <html>.
 */
function bootScript(page: PageId, lang: Lang): string {
  const other: Lang = lang === 'fr' ? 'en' : 'fr';
  return [
    'try{var d=document.documentElement,s=localStorage,',
    `l=s.getItem('${STORAGE.lang}');`,
    `if(l==='${other}'&&document.referrer.indexOf(location.origin)!==0){location.replace('${pagePath(page, other)}'+location.search+location.hash)}`,
    `var t=s.getItem('${STORAGE.theme}');`,
    "if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';",
    "d.setAttribute('data-theme',t);",
    `var a=JSON.parse(s.getItem('${STORAGE.a11y}')||'null');`,
    "if(a){if(a.fontSize)d.style.fontSize=['100%','112%','125%'][a.fontSize]||'';",
    "if(a.highContrast)d.classList.add('high-contrast');",
    "if(a.legibleFont)d.classList.add('legible-font');",
    "if(a.oled)d.classList.add('oled')}",
    "}catch(e){if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.setAttribute('data-theme','dark')}",
  ].join('');
}

interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

function jsonLd(page: PageId, lang: Lang, t: Lookup, faq: readonly FaqEntry[]): string {
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

  if (page === 'home' || page === 'docs') {
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
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: plain(t('crumb.home')), item: absolute(pagePath('home', lang)) },
        { '@type': 'ListItem', position: 2, name: plain(t('title')), item: url },
      ],
    });
  }

  // "<" is escaped so no string can close the script element early.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function headTags(page: PageId, lang: Lang, t: Lookup, faq: readonly FaqEntry[]): string {
  const url = absolute(pagePath(page, lang));
  const title = escapeHtml(plain(t('meta.title')));
  const description = escapeHtml(plain(t('meta.description')));
  const image = absolute('/og-image.jpg');
  const alternates = LANGS.map(
    (code) => `<link rel="alternate" hreflang="${code}" href="${absolute(pagePath(page, code))}" />`,
  ).join('\n    ');

  return `<link rel="canonical" href="${url}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${absolute(pagePath(page, 'fr'))}" />
    <meta name="author" content="${PUBLISHER}" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0d1621" media="(prefers-color-scheme: dark)" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${BRAND}" />
    <meta property="og:locale" content="${lang === 'fr' ? 'fr_FR' : 'en_GB'}" />
    <meta property="og:locale:alternate" content="${lang === 'fr' ? 'en_GB' : 'fr_FR'}" />
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
    <script>${bootScript(page, lang)}</script>
    <script type="application/ld+json">${jsonLd(page, lang, t, faq)}</script>`;
}

/** `robots.txt` and `sitemap.xml`, emitted with the build. */
export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

export function sitemapXml(pages: readonly PageId[]): string {
  const entries = pages.flatMap((page) =>
    LANGS.map((lang) => {
      const links = [
        ...LANGS.map(
          (code) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${absolute(pagePath(page, code))}" />`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${absolute(pagePath(page, 'fr'))}" />`,
      ].join('\n');
      return `  <url>\n    <loc>${absolute(pagePath(page, lang))}</loc>\n${links}\n  </url>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}
