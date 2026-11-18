import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Connect, type Plugin } from 'vite';

import { renderDocsBody, renderDocsNav } from './src/docs/render';
import * as en from './src/i18n/en';
import * as fr from './src/i18n/fr';
import { escapeHtml, inlineToHtml } from './src/lib/inline';
import { breadcrumb, footer, header, ICONS } from './src/site/chrome';
import { LANGS, PAGES, localizeHref, parsePath, type Lang, type PageId } from './src/site/config';
import { headTags, plain, robotsTxt, sitemapXml } from './src/site/seo';

const root = fileURLToPath(new URL('.', import.meta.url));

/** HTML file of each page. The French file is the template; `en/<file>` is a stub that reuses it. */
const FILES: Readonly<Record<PageId, string>> = {
  home: 'index',
  docs: 'docs',
  accessibility: 'accessibility',
  legal: 'legal',
};
const PAGE_IDS = Object.keys(FILES) as PageId[];
const FAQ_COUNT = 7;

type Dictionary = Readonly<Record<string, string>>;

const DICTIONARIES: Readonly<Record<Lang, Readonly<Record<PageId, Dictionary>>>> = {
  fr: {
    home: { ...fr.common, ...fr.home },
    docs: { ...fr.common, ...fr.docs },
    accessibility: { ...fr.common, ...fr.a11y },
    legal: { ...fr.common, ...fr.legal },
  },
  en: {
    home: { ...en.common, ...en.home },
    docs: { ...en.common, ...en.docs },
    accessibility: { ...en.common, ...en.a11y },
    legal: { ...en.common, ...en.legal },
  },
};

/**
 * Maps clean URLs to HTML files during dev and preview, the way the API does
 * in production: `/docs` → `/docs.html`, `/en` → `/en/index.html`, `/en/docs` → `/en/docs.html`.
 */
const cleanUrls: Connect.NextHandleFunction = (request, _response, next) => {
  const [path = '', query] = (request.url ?? '').split('?');
  const suffix = query === undefined ? '' : `?${query}`;
  const { page, lang } = parsePath(path);
  const isPage = path === '/en' || PAGE_IDS.some((id) => path === PAGES[id] || path === `/en${PAGES[id]}`);
  if (isPage && path !== '/' && path !== '/en/') {
    request.url = `${lang === 'en' ? '/en' : ''}/${FILES[page]}.html${suffix}`;
  }
  next();
};

function faqHtml(): string {
  return Array.from({ length: FAQ_COUNT }, (_unused, index) => {
    const n = index + 1;
    return `<details>
              <summary><span data-i18n="faq.${n}.q"></span>${ICONS.chevron('size-5')}</summary>
              <p class="rich" data-i18n="faq.${n}.a"></p>
            </details>`;
  }).join('\n            ');
}

/**
 * Assembles every static page, once per language:
 *  - an `en/*.html` stub is replaced by the French template it points to;
 *  - the shared chrome, the head tags and the generated API reference are injected;
 *  - every empty `data-i18n` element and every `data-i18n-attr` attribute is
 *    filled from the dictionary of the page's language. An unknown key fails
 *    the build, so a typo can never ship as a blank on the page;
 *  - internal links are rewritten to the page's language.
 */
function omnillinkSite(): Plugin {
  return {
    name: 'omnillink-site',
    configureServer(server) {
      server.middlewares.use(cleanUrls);
    },
    configurePreviewServer(server) {
      server.middlewares.use(cleanUrls);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt() });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(PAGE_IDS) });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(source, context) {
        const { page, lang } = parsePath(context.path);
        const template = /^<!--@template ([\w./-]+)-->/.exec(source.trim());
        const html = template === null ? source : readFileSync(`${root}/${FILES[page]}.html`, 'utf8');

        const dictionary = DICTIONARIES[lang][page];
        const lookup = (key: string): string => {
          const value = dictionary[key];
          if (value === undefined) throw new Error(`Unknown i18n key "${key}" in ${context.path}`);
          return value;
        };
        const faq =
          page === 'home'
            ? Array.from({ length: FAQ_COUNT }, (_unused, index) => ({
                question: plain(lookup(`faq.${index + 1}.q`)),
                answer: plain(lookup(`faq.${index + 1}.a`)),
              }))
            : [];

        return html
          .replace('<html lang="fr">', `<html lang="${lang}">`)
          .replace('<!--@head-->', () => headTags(page, lang, lookup, faq))
          .replace('<!--@header-->', () => header(page, lang))
          .replace('<!--@footer-->', () => footer())
          .replace('<!--@breadcrumb-->', () => breadcrumb('title'))
          .replace('<!--@faq-->', () => faqHtml())
          .replaceAll('<!--@docs-nav-->', () => renderDocsNav())
          .replace('<!--@docs-body-->', () => renderDocsBody())
          .replace(/\sdata-i18n-attr="([^"]+)"/g, (whole: string, pairs: string) => {
            const attributes = pairs.split(';').map((pair) => {
              const [attribute, key = ''] = pair.split(':');
              return ` ${attribute}="${escapeHtml(plain(lookup(key)))}"`;
            });
            return `${attributes.join('')}${whole}`;
          })
          .replace(
            /(<([a-z][a-z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>)(<\/\2>)/g,
            (_whole: string, open: string, tag: string, key: string, close: string) =>
              // <title> is raw text: no markup allowed there.
              `${open}${tag === 'title' ? escapeHtml(plain(lookup(key))) : inlineToHtml(lookup(key))}${close}`,
          )
          .replace(/<a\b[^>]*>/g, (tag: string) =>
            // The language switch keeps its fixed targets; every other internal link follows the page.
            tag.includes('data-lang=')
              ? tag
              : tag.replace(/\shref="(\/[^"]*)"/, (_match: string, href: string) => ` href="${localizeHref(href, lang)}"`),
          );
      },
    },
  };
}

export default defineConfig({
  plugins: [omnillinkSite(), tailwindcss()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        LANGS.flatMap((lang) =>
          PAGE_IDS.map((page) => {
            const file = lang === 'fr' ? `${FILES[page]}.html` : `en/${FILES[page]}.html`;
            return [`${lang}-${page}`, file];
          }),
        ),
      ),
    },
  },
  server: {
    port: 5173,
    // The site calls same-origin /api/* and /health; Vite forwards them to the API.
    proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
});
