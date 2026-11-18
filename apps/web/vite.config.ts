import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Connect, type Plugin } from 'vite';

import { renderDocsBody, renderDocsNav } from './src/docs/render';
import * as fr from './src/i18n/fr';
import { escapeHtml, inlineToHtml } from './src/lib/inline';
import { footer, header, headTags, type PageId } from './src/site/chrome';

/** HTML entry points. Each one is served at `/<name>` as well as `/<name>.html`. */
const PAGES: Readonly<Record<string, PageId>> = { index: 'home', docs: 'docs' };

/** Maps the clean URL of a page (`/docs`) to its HTML file during dev and preview. */
const cleanUrls: Connect.NextHandleFunction = (request, _response, next) => {
  const [path = '', query] = (request.url ?? '').split('?');
  const name = path.slice(1);
  if (name !== 'index' && name in PAGES) {
    request.url = `/${name}.html${query === undefined ? '' : `?${query}`}`;
  }
  next();
};

/**
 * Assembles the static pages:
 *  - injects the shared chrome (`<!--@head-->`, `<!--@header-->`, `<!--@footer-->`)
 *    and the generated API reference (`<!--@docs-nav-->`, `<!--@docs-body-->`);
 *  - fills every empty `data-i18n` element and every `data-i18n-attr`
 *    attribute with the French text. An unknown key fails the build, so a
 *    typo can never ship as a blank on the page.
 */
function linkforgeSite(): Plugin {
  const dictionaries: Readonly<Record<PageId, Readonly<Record<string, string>>>> = {
    home: { ...fr.common, ...fr.home },
    docs: { ...fr.common, ...fr.docs },
  };

  return {
    name: 'linkforge-site',
    configureServer(server) {
      server.middlewares.use(cleanUrls);
    },
    configurePreviewServer(server) {
      server.middlewares.use(cleanUrls);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const name = context.path.replace(/^\//, '').replace(/\.html$/, '');
        const page = PAGES[name === '' ? 'index' : name] ?? 'home';
        const dictionary = dictionaries[page];
        const lookup = (key: string): string => {
          const value = dictionary[key];
          if (value === undefined) throw new Error(`Unknown i18n key "${key}" in ${context.path}`);
          return value;
        };

        return html
          .replace('<!--@head-->', headTags())
          .replace('<!--@header-->', header(page))
          .replace('<!--@footer-->', footer())
          .replaceAll('<!--@docs-nav-->', () => renderDocsNav())
          .replace('<!--@docs-body-->', () => renderDocsBody())
          .replace(/\sdata-i18n-attr="([^"]+)"/g, (whole: string, pairs: string) => {
            const attributes = pairs.split(';').map((pair) => {
              const [attribute, key = ''] = pair.split(':');
              return ` ${attribute}="${escapeHtml(lookup(key))}"`;
            });
            return `${attributes.join('')}${whole}`;
          })
          .replace(
            /(<([a-z][a-z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>)(<\/\2>)/g,
            (_whole: string, open: string, tag: string, key: string, close: string) =>
              // <title> is raw text: no markup allowed there.
              `${open}${tag === 'title' ? escapeHtml(lookup(key)) : inlineToHtml(lookup(key))}${close}`,
          );
      },
    },
  };
}

export default defineConfig({
  plugins: [linkforgeSite(), tailwindcss()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(Object.keys(PAGES).map((name) => [name, `${name}.html`])),
    },
  },
  server: {
    port: 5173,
    // The site calls same-origin /api/* and /health; Vite forwards them to the Fastify API.
    proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
});
