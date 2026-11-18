import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Connect, type Plugin } from 'vite';

import { GUIDE_LIST } from './src/content/guides.ts';
import { guideSearchEntries, guideText, resetCodeCounter, type SearchEntry } from './src/content/render.ts';
import { ENDPOINTS } from './src/docs/spec.ts';
import { a11y as enA11y } from './src/i18n/en/a11y.ts';
import { common as enCommon } from './src/i18n/en/common.ts';
import { consoleText as enConsole } from './src/i18n/en/console.ts';
import { docs as enDocs } from './src/i18n/en/docs.ts';
import { home as enHome } from './src/i18n/en/home.ts';
import { playground as enPlayground } from './src/i18n/en/playground.ts';
import { status as enStatus } from './src/i18n/en/status.ts';
import { system as enSystem } from './src/i18n/en/system.ts';
import { a11y as frA11y } from './src/i18n/fr/a11y.ts';
import { common as frCommon } from './src/i18n/fr/common.ts';
import { consoleText as frConsole } from './src/i18n/fr/console.ts';
import { docs as frDocs } from './src/i18n/fr/docs.ts';
import { home as frHome } from './src/i18n/fr/home.ts';
import { playground as frPlayground } from './src/i18n/fr/playground.ts';
import { status as frStatus } from './src/i18n/fr/status.ts';
import { system as frSystem } from './src/i18n/fr/system.ts';
import * as legal from './src/i18n/legal.ts';
import { escapeHtml, inlineToHtml } from './src/lib/inline.ts';
import { bootSource, serviceWorkerSource } from './src/site/boot.ts';
import { footer, header } from './src/site/chrome.ts';
import { BRAND, LANGS, PAGE_IDS, SITE_ORIGIN, UTILITY_PAGES, localizeHref, pagePath, parsePath, type Lang, type PageId } from './src/site/config.ts';
import { entryOf, guideOf, pageBody } from './src/site/pages.ts';
import { headTags, humansTxt, plain, robotsTxt, securityTxt, sitemapXml } from './src/site/seo.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const FAQ_COUNT = 7;
type Dictionary = Readonly<Record<string, string>>;

/** Date of the last change to the site in the repository (falls back to the build time). */
const MODIFIED = ((): string => {
  try {
    const stamp = execSync('git log -1 --format=%cI -- .', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (stamp !== '') return new Date(stamp).toISOString();
  } catch {
    // Not a git checkout (deployment tarball): use the build time.
  }
  return new Date().toISOString();
})();

const SECTIONS: Readonly<Record<Lang, Readonly<Record<string, Dictionary>>>> = {
  fr: { common: frCommon, home: frHome, console: frConsole, docs: frDocs, a11y: frA11y, playground: frPlayground, status: frStatus, system: frSystem, legal: legal.fr },
  en: { common: enCommon, home: enHome, console: enConsole, docs: enDocs, a11y: enA11y, playground: enPlayground, status: enStatus, system: enSystem, legal: legal.en },
};

/** The dictionary a page is filled from: shared text, plus the page's own. */
function dictionaryFor(page: PageId, lang: Lang): Dictionary {
  const s = SECTIONS[lang] as Readonly<Record<string, Dictionary>>;
  const common = s['common'] ?? {};
  const guide = guideOf(page);
  if (guide !== undefined) {
    return {
      ...common,
      'meta.title': `${plain(guide.title[lang])} · ${BRAND}`,
      'meta.description': plain(guide.description[lang]),
      title: guide.title[lang],
      lead: guide.lead[lang],
    };
  }
  const system = s['system'] ?? {};
  switch (page) {
    case 'home':
      return { ...common, ...s['home'], ...s['console'] };
    case 'playground':
      return { ...common, ...s['playground'], ...s['console'] };
    case 'docs':
      return { ...common, ...s['docs'] };
    case 'status':
      return { ...common, ...s['status'] };
    case 'accessibility':
      return { ...common, ...s['a11y'] };
    case 'legal':
      return { ...common, ...s['legal'] };
    case 'offline':
      return { ...common, ...system, 'meta.title': system['off.meta.title'] ?? '', 'meta.description': system['off.meta.description'] ?? '', title: system['off.title'] ?? '' };
    default:
      return { ...common, ...system, 'meta.title': system['nf.meta.title'] ?? '', 'meta.description': system['nf.meta.description'] ?? '', title: system['nf.title'] ?? '' };
  }
}

/** File of a page: `/` → `index.html`, `/en/docs/errors` → `en/docs/errors.html`. */
function fileOf(page: PageId, lang: Lang): string {
  const path = pagePath(page, lang);
  return path.endsWith('/') ? `${path.slice(1)}index.html` : `${path.slice(1)}.html`;
}

const STUB = '<!--@page-->\n';

/** Vite needs a real file per HTML entry: write the one-line stubs that are missing. */
function ensureStubs(): Record<string, string> {
  const input: Record<string, string> = {};
  for (const lang of LANGS) {
    for (const page of PAGE_IDS) {
      const file = fileOf(page, lang);
      const full = join(root, file);
      if (!existsSync(full)) {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, STUB);
      }
      input[`${lang}-${page}`] = file;
    }
  }
  return input;
}

/** Maps clean URLs to HTML files during dev and preview, the way the API does in production. */
const cleanUrls: Connect.NextHandleFunction = (request, response, next) => {
  const [path = '', query] = (request.url ?? '').split('?');
  if (path === '/boot.js') {
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    response.end(bootSource());
    return;
  }
  const index = /^\/search-index\.(\w+)\.json$/.exec(path);
  if (index !== null && LANGS.includes(index[1] as Lang)) {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(searchIndex(index[1] as Lang)));
    return;
  }
  if (path.startsWith('/@') || path.startsWith('/src/') || path.startsWith('/node_modules/') || path.startsWith('/api/') || path === '/health' || /\.\w+$/.test(path)) return next();
  const { page, lang } = parsePath(path);
  if (page === 'not-found' && path !== pagePath('not-found', lang)) response.statusCode = 404;
  request.url = `/${fileOf(page, lang)}${query === undefined ? '' : `?${query}`}`;
  next();
};

// ---- Search index, llms.txt ----------------------------------------------------------------

/** Sections of the API reference: anchor, title key, text key. */
const REFERENCE_SECTIONS: ReadonlyArray<readonly [string, string, string]> = [
  ['quick-start', 'quickstart.title', 'quickstart.p1'],
  ['authentication', 'auth.title', 'auth.p1'],
  ['rate-limits', 'limits.title', 'limits.p1'],
  ['response-format', 'format.title', 'format.p1'],
  ['caching', 'cache.title', 'cache.p1'],
  ['rendering', 'render.title', 'render.p1'],
  ...ENDPOINTS.map((endpoint): readonly [string, string, string] => [endpoint.id, endpoint.title, endpoint.intro[0] ?? endpoint.title]),
  ['openapi', 'openapi.h', 'openapi.p1'],
  ['health', 'health.h', 'health.p1'],
  ['errors', 'errors.title', 'errors.p1'],
  ['security', 'security.title', 'security.p1'],
];

const pageTitle = (page: PageId, lang: Lang): string => plain(dictionaryFor(page, lang)['meta.title'] ?? '').replace(` · ${BRAND}`, '');

function searchIndex(lang: Lang): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const page of PAGE_IDS) {
    if (UTILITY_PAGES.includes(page) || guideOf(page) !== undefined) continue;
    const dictionary = dictionaryFor(page, lang);
    entries.push({ k: 'p', t: page === 'home' ? plain(dictionary['nav.home'] ?? BRAND) : pageTitle(page, lang), u: pagePath(page, 'fr'), x: plain(dictionary['meta.description'] ?? '') });
  }
  for (const guide of GUIDE_LIST) entries.push(...guideSearchEntries(guide, lang, pagePath(guide.id, 'fr')));

  const docs = dictionaryFor('docs', lang);
  const reference = pageTitle('docs', lang);
  for (const [id, title, text] of REFERENCE_SECTIONS) {
    entries.push({ k: 'd', t: plain(docs[title] ?? id), u: `${pagePath('docs', 'fr')}#${id}`, p: reference, x: plain(docs[text] ?? '') });
  }
  for (const endpoint of ENDPOINTS) {
    for (const row of endpoint.params) {
      entries.push({ k: 'd', t: `${row.name} · ${endpoint.path.replace('/api/v1', '')}`, u: `${pagePath('docs', 'fr')}#${endpoint.id}`, p: reference, x: plain(docs[row.description] ?? '') });
    }
  }
  const home = dictionaryFor('home', lang);
  for (const [anchor, key] of [['demo', 'demo.title'], ['features', 'cap.title'], ['proof', 'proof.title'], ['tools', 'tools.title'], ['self-host', 'selfHost.title'], ['faq', 'faq.title']] as const) {
    entries.push({ k: 'd', t: plain(home[key] ?? anchor), u: `/#${anchor}`, p: plain(home['nav.home'] ?? '') });
  }
  for (let n = 1; n <= FAQ_COUNT; n += 1) {
    entries.push({ k: 'd', t: plain(home[`faq.${n}.q`] ?? ''), u: '/#faq', p: plain(home['faq.title'] ?? ''), x: plain(home[`faq.${n}.a`] ?? '') });
  }
  return entries;
}

/** `llms.txt`: a short map of the documentation for language models (English, then French). */
function llmsTxt(): string {
  const lines = [`# ${BRAND}`, '', `> ${plain(enCommon['footer.tagline'])}`, '', `${BRAND} is an open-source (MIT), self-hostable HTTP API. Every endpoint is a GET under /api/v1, except the metadata batch. The OpenAPI 3.1 document at ${SITE_ORIGIN}/api/v1/openapi.json is the source of truth.`, ''];
  for (const lang of ['en', 'fr'] as const) {
    lines.push(lang === 'en' ? '## Documentation' : '## Documentation en français', '');
    lines.push(`- [${pageTitle('docs', lang)}](${SITE_ORIGIN}${pagePath('docs', lang)}): ${plain(dictionaryFor('docs', lang)['meta.description'] ?? '')}`);
    for (const guide of GUIDE_LIST) lines.push(`- [${plain(guide.title[lang])}](${SITE_ORIGIN}${pagePath(guide.id, lang)}): ${plain(guide.description[lang])}`);
    lines.push('');
  }
  lines.push('## Optional', '', `- [Full text of the documentation](${SITE_ORIGIN}/llms-full.txt)`, `- [Playground](${SITE_ORIGIN}${pagePath('playground', 'en')})`, `- [Source code](https://github.com/kayzen-lyon/linkforge)`, '');
  return lines.join('\n');
}

/** `llms-full.txt`: the guides and the reference as plain text, in English. */
function llmsFullTxt(): string {
  const docs = dictionaryFor('docs', 'en');
  const text = (key: string): string => plain(docs[key] ?? '');
  const reference = ENDPOINTS.map((endpoint) =>
    [
      `### GET ${endpoint.path}`,
      endpoint.intro.map(text).join(' '),
      ...endpoint.params.map((row) => `- ${row.name} (${plain(row.type)}${row.required === true ? ', required' : ''}${row.fallback === undefined ? '' : `, default ${plain(row.fallback)}`}): ${text(row.description)}`),
    ].join('\n'),
  ).join('\n\n');
  return [`# ${BRAND}: full documentation`, plain(enCommon['footer.tagline']), ...GUIDE_LIST.map((guide) => guideText(guide, 'en')), `# ${text('title')}`, text('lead'), reference, ''].join('\n\n');
}

// ---- Performance budget ---------------------------------------------------------------------

/** Brotli-compressed weight allowed for one page: its HTML plus the scripts and styles it loads. */
const BUDGET_KB: Readonly<Record<string, number>> = { home: 75, playground: 70, docs: 55, default: 45 };

function checkBudget(outDir: string): void {
  const brotli = (file: string): number => brotliCompressSync(readFileSync(file)).length;
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
  const rows: string[] = [];
  let failed = false;
  for (const file of walk(outDir).filter((name) => name.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((match) => join(outDir, match[1] ?? ''));
    // Static imports of the entry chunks are part of the first load too.
    const seen = new Set(assets);
    for (const asset of [...seen]) {
      if (!asset.endsWith('.js')) continue;
      for (const match of readFileSync(asset, 'utf8').matchAll(/from\s*"\.\/([^"]+\.js)"|import\s*"\.\/([^"]+\.js)"/g)) seen.add(join(outDir, 'assets', match[1] ?? match[2] ?? ''));
    }
    const total = (brotli(file) + [...seen].reduce((sum, asset) => sum + (existsSync(asset) ? brotli(asset) : 0), 0)) / 1024;
    const { page } = parsePath(`/${relative(outDir, file)}`);
    const limit = BUDGET_KB[page] ?? BUDGET_KB['default'] ?? 45;
    if (total > limit) failed = true;
    rows.push(`${total > limit ? 'OVER' : 'ok  '} ${total.toFixed(1).padStart(6)} kB br (budget ${limit})  /${relative(outDir, file)}`);
  }
  console.log(`\nPerformance budget, first load per page (HTML + CSS + JS, Brotli):\n${rows.sort().join('\n')}`);
  if (failed) throw new Error('Performance budget exceeded: see the table above.');
}

// ---- The plugin --------------------------------------------------------------------------------

/**
 * Assembles every static page, once per language:
 *  - every HTML entry is a one-line stub, replaced by the page built from
 *    `src/site/pages.ts`, the shared chrome and the head tags;
 *  - every empty `data-i18n` element and every `data-i18n-attr` attribute is
 *    filled from the dictionary of the page's language. An unknown key fails
 *    the build, so a typo can never ship as a blank on the page;
 *  - internal links are rewritten to the page's language.
 * It also emits the files that are derived from the content: boot script,
 * service worker, search indexes, sitemap, robots.txt, llms.txt, security.txt.
 */
function omnillinkSite(): Plugin {
  let outDir = join(root, 'dist');
  return {
    name: 'omnillink-site',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(cleanUrls);
    },
    configurePreviewServer(server) {
      server.middlewares.use(cleanUrls);
    },
    generateBundle() {
      const emit = (fileName: string, source: string): void => {
        this.emitFile({ type: 'asset', fileName, source });
      };
      emit('boot.js', bootSource());
      emit('sw.js', serviceWorkerSource(MODIFIED.replace(/\D/g, '').slice(0, 14)));
      emit('robots.txt', robotsTxt());
      emit('sitemap.xml', sitemapXml(PAGE_IDS.filter((page) => !UTILITY_PAGES.includes(page)), MODIFIED));
      emit('llms.txt', llmsTxt());
      emit('llms-full.txt', llmsFullTxt());
      emit('humans.txt', humansTxt(MODIFIED));
      emit('.well-known/security.txt', securityTxt(MODIFIED));
      for (const lang of LANGS) emit(`search-index.${lang}.json`, JSON.stringify(searchIndex(lang)));
    },
    closeBundle() {
      if (existsSync(join(outDir, 'index.html'))) checkBudget(outDir);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(_source, context) {
        const { page, lang } = parsePath(context.path);
        const dictionary = dictionaryFor(page, lang);
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
        resetCodeCounter();
        const built = `<time datetime="${MODIFIED.slice(0, 10)}">${new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(MODIFIED))}</time>`;

        const html = `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title data-i18n="meta.title"></title>
    <meta name="description" data-i18n-attr="content:meta.description" />
    ${headTags(page, lang, lookup, faq, MODIFIED)}
  </head>
  <body data-page="${page}">
    ${header(page, lang)}

    ${pageBody(page, lang)}

    ${footer().replace('<!--@built-->', built)}
    <script type="module" src="/src/entries/${entryOf(page)}.${lang}.ts"></script>
  </body>
</html>
`;
        return html
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
            // The language selector keeps its fixed targets; every other internal link follows the page.
            tag.includes('data-lang=')
              ? tag
              : tag.replace(/\shref="(\/[^"]*)"/, (_match: string, href: string) => ` href="${localizeHref(href.replace(/&amp;/g, '&'), lang).replace(/&/g, '&amp;')}"`),
          );
      },
    },
  };
}

export default defineConfig({
  plugins: [omnillinkSite(), tailwindcss()],
  build: {
    rollupOptions: { input: ensureStubs() },
  },
  server: {
    port: 5173,
    // The site calls same-origin /api/* and /health; Vite forwards them to the API.
    proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
});
