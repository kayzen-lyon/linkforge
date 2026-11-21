import { readFileSync } from 'node:fs';
/**
 * Build-time bodies of every page. Text is carried by `data-i18n` keys (filled
 * by the Vite plugin in the page's language), except the guides, whose prose
 * is rendered directly from `src/content/guides.ts`.
 */
import { DEFAULT_URL, consoleMarkup } from '../console/markup.ts';
import { GUIDE_LIST } from '../content/guides.ts';
import { codeFigure, guideHeadings, highlightLines, renderGuideBody } from '../content/render.ts';
import { SAMPLES } from '../content/samples.ts';
import type { Guide } from '../content/types.ts';
import { renderDocsBody, renderDocsNav } from '../docs/render.ts';
import { escapeHtml } from '../lib/inline.ts';
import { breadcrumb } from './chrome.ts';
import { PAGES, REPO_URL, REPO_WEB_DIR, SITE_ORIGIN, type GuideId, type Lang, type PageId } from './config.ts';
import { icon, type IconName } from './icons.ts';

const t = (key: string): string => `data-i18n="${key}"`;
const p = (key: string, cls = ''): string => `<p${cls === '' ? '' : ` class="${cls}"`} ${t(key)}></p>`;
const list = (keys: readonly string[], cls = ''): string =>
  `<ul${cls === '' ? '' : ` class="${cls}"`}>${keys.map((key) => `<li ${t(key)}></li>`).join('')}</ul>`;
const range = (prefix: string, count: number): string[] => Array.from({ length: count }, (_unused, at) => `${prefix}.${at + 1}`);

const head = (eyebrow: string, title: string, lead: string | null, id: string): string =>
  `<div class="section-head" data-reveal>
          <p class="eyebrow" ${t(eyebrow)}></p>
          <h2 id="${id}" ${t(title)}></h2>
          ${lead === null ? '' : `<p class="lead" ${t(lead)}></p>`}
        </div>`;

/** Link to the playground with a request already filled in (never run automatically). */
const tryLink = (path: string, query: Readonly<Record<string, string>> = {}): string => {
  const search = new URLSearchParams({ url: DEFAULT_URL, ...query }).toString();
  return `${PAGES.playground}?r=${encodeURIComponent(`GET ${path}?${search}`)}`;
};

const formatBytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`;

// ---- Landing page ----------------------------------------------------------------------

function heroDemo(): string {
  const { meta } = SAMPLES;
  const json = JSON.stringify({ title: meta.title, publisher: meta.publisher, author: meta.author, lang: meta.lang, date: meta.date }, null, 2);
  return `<figure class="hero-demo" aria-labelledby="hero-demo-label">
          <figcaption id="hero-demo-label" class="sr-only" ${t('hero.demo.label')}></figcaption>
          <p class="hero-url"><span class="verb">GET</span><span class="hero-url-text mono">/api/v1/meta?url=example.com/blog/launch</span></p>
          <div class="hero-results">
            <div class="hero-tile hero-tile-card">
              <p class="hero-tile-label">${icon('link', 'size-3.5')}<span ${t('hero.demo.card')}></span></p>
              <div class="mini-card" lang="en">
                <picture><source type="image/avif" srcset="/samples/screenshot-desktop.avif" /><img src="/samples/screenshot-desktop.webp" alt="" width="${SAMPLES.screenshot.desktop.width}" height="${SAMPLES.screenshot.desktop.height}" decoding="async" /></picture>
                <p class="mini-site mono">example.com</p>
                <p class="mini-title">${escapeHtml(meta.title)}</p>
                <p class="mini-desc">${escapeHtml(meta.description)}</p>
              </div>
            </div>
            <div class="hero-tile hero-tile-shot">
              <p class="hero-tile-label">${icon('camera', 'size-3.5')}<span ${t('hero.demo.shot')}></span></p>
              <picture><source type="image/avif" srcset="/samples/screenshot-mobile.avif" /><img class="mini-phone" src="/samples/screenshot-mobile.webp" alt="" width="${SAMPLES.screenshot.mobile.width}" height="${SAMPLES.screenshot.mobile.height}" decoding="async" /></picture>
            </div>
            <div class="hero-tile hero-tile-json">
              <p class="hero-tile-label">${icon('braces', 'size-3.5')}<span ${t('hero.demo.json')}></span></p>
              <pre class="mini-code" lang="en"><code>${highlightLines(json, 'json')}</code></pre>
            </div>
          </div>
          <p class="hero-caption" ${t('hero.demo.caption')}></p>
        </figure>`;
}

/** A capability card. `requires` is the API path: the client hides the card if the live spec lacks it. */
function capCard(id: string, method: string, path: string, name: IconName, mini: string, tryHref: string, docs: string, docsKey = 'cap.docs'): string {
  return `<li data-requires="${path}"><article class="cap-card glass-strong card-lift" data-reveal>
              <div class="cap-mini">${mini}</div>
              <div class="cap-body">
                <p class="flex items-center gap-2"><span class="icon-tile icon-tile-sm">${icon(name, 'size-4')}</span><span class="tag">${method} ${path.replace('/api/v1', '')}</span></p>
                <h4 ${t(`cap.${id}.title`)}></h4>
                <p class="rich" ${t(`cap.${id}.body`)}></p>
                <p class="cap-links">
                  <a class="text-link" href="${tryHref}"><span class="link-grow" ${t('cap.try')}></span>${icon('arrowRight', 'size-4')}</a>
                  <a class="text-link text-link-quiet" href="${docs}"><span class="link-grow" ${t(docsKey)}></span></a>
                </p>
              </div>
            </article></li>`;
}

const code = (source: string, wrap = false): string =>
  `<pre class="mini-code${wrap ? ' mini-code-wrap' : ''}" lang="en"><code>${highlightLines(source, 'json')}</code></pre>`;
const facts = (pairs: ReadonlyArray<readonly [string, string | number]>): string =>
  `<dl class="mini-facts" lang="en">${pairs.map(([name, value]) => `<div${name === 'chain' ? ' class="wide"' : ''}><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join('')}</dl>`;
const ref = (id: string): string => `${PAGES.docs}#${id}`;

/** Capabilities in five families, each card with a miniature of a genuine response. */
function capabilityGroups(): string {
  const S = SAMPLES;
  const play = (path: string, query: Readonly<Record<string, string>> = {}): string => tryLink(`/api/v1/${path}`, query);
  const image = (file: string, width: number, height: number, cls = '', avif = file === 'og.webp'): string =>
    `${avif ? `<picture><source type="image/avif" srcset="/samples/${file.replace(/\.webp$/, '.avif')}" />` : ''}<img class="mini-image ${cls}" src="/samples/${file}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async" />${avif ? '</picture>' : ''}`;

  const metaMini = `<div class="mini-card mini-card-row" lang="en"><p class="mini-site mono">example.com</p><p class="mini-title">${escapeHtml(S.meta.title)}</p><p class="mini-desc">${escapeHtml(S.meta.description)}</p><p class="mini-site">${escapeHtml(S.meta.author)} · ${escapeHtml(S.meta.publisher)}</p></div>`;
  const shotMini = `<div class="mini-shots"><picture><source type="image/avif" srcset="/samples/screenshot-desktop.avif" /><img src="/samples/screenshot-desktop.webp" alt="" width="${S.screenshot.desktop.width}" height="${S.screenshot.desktop.height}" loading="lazy" decoding="async" /></picture><picture><source type="image/avif" srcset="/samples/screenshot-mobile.avif" /><img class="mini-phone" src="/samples/screenshot-mobile.webp" alt="" width="${S.screenshot.mobile.width}" height="${S.screenshot.mobile.height}" loading="lazy" decoding="async" /></picture></div>`;
  const pdfMini = `<div class="mini-pdf">${icon('doc', 'size-8')}<p><span ${t('cap.pdf.fact')}></span><br /><span class="mono">${S.pdf.contentType} · ${formatBytes(S.pdf.bytes)}</span></p></div>`;
  const htmlMini = `<div class="mini-pdf">${icon('code', 'size-8')}<p><span ${t('cap.html.fact')}></span><br /><span class="mono">text/plain · ${formatBytes(S.html.bytes)}</span></p></div>`;
  const batchMini = `<ul class="mini-rows">${S.batch
    .map(
      (row) =>
        `<li><span class="badge ${row.status === 'success' ? 'badge-ok' : 'badge-error'}">${icon(row.status === 'success' ? 'check' : 'alert', 'size-3.5')}${escapeHtml(row.status === 'success' ? '200' : (row.code ?? 'error'))}</span><span class="mono truncate">${escapeHtml(row.url ?? '')}</span></li>`,
    )
    .join('')}</ul>`;
  const tableMini = `<table class="mini-table" lang="en"><thead><tr>${S.tables.headers.map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${S.tables.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const linksMini = `<ul class="mini-rows" lang="en">${S.links.first.map((link) => `<li><span class="badge">${link.internal ? 'int' : 'ext'}</span><span class="truncate">${escapeHtml(link.text)}</span><span class="mono truncate text-muted-foreground">${escapeHtml(link.url.replace('https://', ''))}</span></li>`).join('')}</ul>`;
  const techMini = `<ul class="mini-rows" lang="en">${S.tech.map((item) => `<li><span class="badge badge-ok">${escapeHtml(item.confidence)}</span><span class="font-semibold">${escapeHtml(item.name)}${item.version === null ? '' : ` ${escapeHtml(item.version)}`}</span><span class="truncate text-muted-foreground">${escapeHtml(item.evidence)}</span></li>`).join('')}</ul>`;
  const insightsMini = facts([
    ['TTFB', `${S.insights.timings.ttfbMs} ms`],
    ['FCP', `${S.insights.vitals.fcpMs} ms`],
    ['LCP', `${S.insights.vitals.lcpMs} ms`],
    ['CLS', S.insights.vitals.cls],
    ['requests', S.insights.requests],
    ['transfer', formatBytes(S.insights.transferBytes)],
  ]);
  const checkMini = facts([
    ['chain', S.check.chain.join(' → ')],
    ['status', S.check.status],
    ['time', `${S.check.durationMs} ms`],
  ]);
  const sitemapMini = `<div class="mini-pdf">${icon('list', 'size-8')}<p><span class="mono">robots.txt ${S.sitemap.robotsFound ? '✓' : '–'}</span><br /><span class="mono">${S.sitemap.urlCount} URLs · ${S.sitemap.sitemaps} sitemap</span></p></div>`;
  const imageFacts = (item: { format: string; width: number; height: number; bytes: number }): string =>
    facts([
      ['format', item.format],
      ['width', `${item.width} px`],
      ['height', `${item.height} px`],
      ['size', formatBytes(item.bytes)],
    ]);
  // Colours as SVG fills: the page allows no inline style, and these values come from the API.
  const total = S.palette.reduce((sum, color) => sum + color.population, 0) || 1;
  let offset = 0;
  const paletteMini = `<div class="mini-palette" lang="en"><svg viewBox="0 0 100 26" preserveAspectRatio="none" role="img" aria-label="${S.palette.map((color) => color.hex).join(', ')}">${S.palette
    .map((color) => {
      const width = (color.population / total) * 100;
      const rect = `<rect x="${offset.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="26" fill="${/^#[0-9a-f]{6}$/i.test(color.hex) ? color.hex : '#000000'}" />`;
      offset += width;
      return rect;
    })
    .join('')}</svg><p class="mono">${S.palette.map((color) => color.hex).join(' · ')}</p></div>`;
  const oembedMini = facts([
    ['type', S.oembed.type],
    ['provider', S.oembed.providerName],
    ['title', S.oembed.title],
    ['size', `${S.oembed.width} × ${S.oembed.height}`],
  ]);
  const articleMini = code(JSON.stringify(Object.fromEntries(Object.entries(S.article).slice(0, 5)), null, 2));
  const mcpMini = code(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'omnillink_content' } }, null, 2));

  const group = (key: string, cards: string[]): string =>
    `<div class="cap-group" data-reveal>
            <h3 class="cap-group-title" ${t(key)}></h3>
            <ul class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              ${cards.join('\n              ')}
            </ul>
          </div>`;

  return [
    group('grp.read', [
      capCard('meta', 'GET', '/api/v1/meta', 'link', metaMini, play('meta'), ref('meta')),
      capCard('content', 'GET', '/api/v1/content', 'doc', `<pre class="mini-code mini-code-wrap" lang="en"><code>${escapeHtml(S.content.markdown.split('\n').slice(0, 9).join('\n'))}</code></pre>`, play('content'), ref('content')),
      capCard('extract', 'GET', '/api/v1/extract', 'cursor', code(JSON.stringify(S.extract.fields, null, 2)), play('extract', { fields: JSON.stringify(S.extract.rules) }), ref('extract')),
      capCard('batch', 'POST', '/api/v1/meta/batch', 'stack', batchMini, `${PAGES.playground}?r=${encodeURIComponent('POST /api/v1/meta/batch')}&b=${encodeURIComponent(JSON.stringify({ urls: [DEFAULT_URL] }))}`, ref('meta-batch')),
      capCard('preset', 'GET', '/api/v1/extract', 'stack', articleMini, play('extract', { preset: 'article' }), ref('extract')),
      capCard('tables', 'GET', '/api/v1/tables', 'rows', tableMini, play('tables'), ref('tables')),
      capCard('links', 'GET', '/api/v1/links', 'link', linksMini, play('links'), ref('links')),
      capCard('html', 'GET', '/api/v1/html', 'code', htmlMini, play('html'), ref('html')),
      capCard('oembed', 'GET', '/api/v1/oembed', 'play', oembedMini, play('oembed'), ref('oembed')),
    ]),
    group('grp.capture', [
      capCard('screenshot', 'GET', '/api/v1/screenshot', 'camera', shotMini, play('screenshot', { device: 'mobile' }), ref('screenshot')),
      capCard('animation', 'GET', '/api/v1/animation', 'play', image('animation.webp', 320, 200), play('animation'), ref('animation')),
      capCard('pdf', 'GET', '/api/v1/pdf', 'download', pdfMini, play('pdf'), ref('pdf')),
    ]),
    group('grp.inspect', [
      capCard('tech', 'GET', '/api/v1/tech', 'braces', techMini, play('tech'), ref('tech')),
      capCard('insights', 'GET', '/api/v1/insights', 'pulse', insightsMini, play('insights'), ref('insights')),
      capCard('check', 'GET', '/api/v1/check', 'refresh', checkMini, play('check'), ref('check')),
      capCard('sitemap', 'GET', '/api/v1/sitemap', 'list', sitemapMini, play('sitemap'), ref('sitemap')),
      capCard('favicon', 'GET', '/api/v1/favicon', 'image', imageFacts(S.favicon), play('favicon'), ref('favicon')),
      capCard('image', 'GET', '/api/v1/image', 'image', imageFacts(S.image), play('image'), ref('image')),
      capCard('palette', 'GET', '/api/v1/palette', 'eye', paletteMini, play('palette'), ref('palette')),
    ]),
    group('grp.generate', [
      capCard('qr', 'GET', '/api/v1/qr', 'hash', image('qr.svg', 160, 160, 'mini-qr'), play('qr'), ref('qr')),
      capCard('og', 'GET', '/api/v1/og', 'image', image('og.webp', 480, 252), `${PAGES.playground}?r=${encodeURIComponent('GET /api/v1/og?title=Omnillink')}`, ref('og')),
    ]),
    group('grp.agents', [
      capCard('mcp', 'POST', '/mcp', 'bot', mcpMini, PAGES['ai-agents'] + '#mcp', PAGES['ai-agents'], 'cap.guide'),
      capCard('content', 'GET', '/api/v1/content', 'doc', code(JSON.stringify({ format: 'markdown', citations: true, wordCount: S.content.wordCount }, null, 2)), play('content', { format: 'markdown', citations: 'true' }), PAGES['ai-agents'], 'cap.guide'),
    ]),
  ].join('\n          ');
}

const USE_CASES: ReadonlyArray<readonly [string, string]> = [
  [
    'js',
    `async function linkCard(url) {
  const params = new URLSearchParams({ url });
  const response = await fetch(\`${SITE_ORIGIN}/api/v1/meta?\${params}\`);
  const { status, data } = await response.json();
  if (status !== "success") return null;
  return { title: data.title, image: data.image?.url ?? null, site: data.publisher };
}`,
  ],
  [
    'python',
    `import requests

response = requests.get(
    "${SITE_ORIGIN}/api/v1/content",
    params={"url": "https://example.com/blog/launch", "format": "markdown", "citations": "true"},
    timeout=60,
)
response.raise_for_status()
prompt = "Summarise this page:\\n\\n" + response.text`,
  ],
  [
    'bash',
    `curl -o card.jpg \\
  "${SITE_ORIGIN}/api/v1/screenshot?url=https%3A%2F%2Fexample.com%2Fblog%2Flaunch&width=1200&height=630&format=jpeg"

curl -o archive.pdf \\
  "${SITE_ORIGIN}/api/v1/pdf?url=https%3A%2F%2Fexample.com%2Fblog%2Flaunch&force=true"`,
  ],
  [
    'bash',
    `curl -G "${SITE_ORIGIN}/api/v1/extract" \\
  --data-urlencode "url=https://example.com/product/42" \\
  --data-urlencode 'fields={"name":{"selector":"h1"},"price":{"selector":".price","type":"number"}}' \\
  --data-urlencode "ttl=900"`,
  ],
];

const CLI_EXAMPLE = `omnillink meta https://github.com
omnillink meta https://github.com --json | jq .data.image.url
omnillink shot https://github.com -o github.png
cat urls.txt | omnillink meta --json --concurrency 8 > meta.ndjson`;

function home(): string {
  const feature = (key: string, name: IconName): string =>
    `<li><article class="feature-card glass-strong card-lift" data-reveal>
              <span class="icon-tile mb-6">${icon(name, 'size-6')}</span>
              <h3 ${t(`features.${key}.title`)}></h3>
              <p class="rich" ${t(`features.${key}.body`)}></p>
            </article></li>`;
  const proof = (key: string, name: IconName, href: string): string =>
    `<li><article class="feature-card glass-strong card-lift" data-reveal>
              <span class="icon-tile mb-6">${icon(name, 'size-6')}</span>
              <h3 ${t(`proof.${key}.title`)}></h3>
              <p class="rich mb-4" ${t(`proof.${key}.body`)}></p>
              <p class="mt-auto"><a class="text-link" href="${href}"${href.startsWith('http') ? ' rel="noopener"' : ''}><span class="link-grow" ${t(`proof.${key}.link`)}></span>${icon('arrowRight', 'size-4')}</a></p>
            </article></li>`;
  const tool = (key: string, name: IconName, href: string, repo: string): string =>
    `<li><article class="feature-card glass-strong card-lift" data-reveal>
              <p class="mb-6 flex items-center justify-between gap-3"><span class="icon-tile">${icon(name, 'size-6')}</span><span class="tag">${repo}</span></p>
              <h3 ${t(`tools.${key}.title`)}></h3>
              <p class="rich mb-4" ${t(`tools.${key}.body`)}></p>
              <p class="mt-auto"><a class="text-link" href="${href}"><span class="link-grow" ${t('tools.guide')}></span>${icon('arrowRight', 'size-4')}</a></p>
            </article></li>`;
  const step = (n: number): string =>
    `<li><article class="feature-card glass-strong" data-reveal>
              <p class="mb-4 flex items-center gap-4"><span class="step-num" aria-hidden="true">0${n}</span><span class="sr-only" ${t(`how.step.${n}`)}></span></p>
              <h3 ${t(`how.${n}.title`)}></h3>
              <p class="rich" ${t(`how.${n}.body`)}></p>
            </article></li>`;
  const command = (n: number, source: string): string =>
    `<li>
                <p ${t(`selfHost.step${n}`)}></p>
                ${codeFigure('cli.label', source, 'bash', true)}
              </li>`;
  const fact = (n: number): string =>
    `<article><h3 class="mb-2 text-lg! font-bold!" ${t(`selfHost.fact${n}.title`)}></h3><p class="rich text-sm text-muted-foreground" ${t(`selfHost.fact${n}.body`)}></p></article>`;
  const versus = (n: number): string =>
    `<tr><th scope="row" ${t(`vs.${n}.t`)}></th><td><span class="cell-label" ${t('vs.h.own')}></span><span ${t(`vs.${n}.a`)}></span></td><td><span class="cell-label" ${t('vs.h.hosted')}></span><span ${t(`vs.${n}.b`)}></span></td></tr>`;
  const faq = Array.from({ length: 7 }, (_unused, at) => {
    const n = at + 1;
    return `<details>
              <summary><span ${t(`faq.${n}.q`)}></span>${icon('chevron', 'size-5')}</summary>
              <p class="rich" ${t(`faq.${n}.a`)}></p>
            </details>`;
  }).join('\n            ');

  return `<main id="main" class="page-main" tabindex="-1">
      <section class="hero" aria-labelledby="hero-title">
        <div class="im-wall" aria-hidden="true" inert></div>
        <div class="shell grid items-center gap-12 pt-10 pb-16 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:pb-24">
          <div class="min-w-0">
            <p class="eyebrow mb-5" ${t('hero.eyebrow')}></p>
            <h1 id="hero-title" class="mb-5"><span ${t('hero.title.a')}></span> <span class="text-accent" ${t('hero.title.b')}></span></h1>
            <p class="lead mb-8 md:text-xl" ${t('hero.lead')}></p>
            <ul class="mb-8 flex flex-wrap gap-2.5">
              ${['mit', 'selfHost', 'ssrf', 'openapi'].map((key) => `<li class="chip">${icon('check', 'size-3.5')}<span ${t(`hero.chip.${key}`)}></span></li>`).join('')}
            </ul>
            <div class="flex flex-col gap-3 sm:flex-row">
              <a class="btn btn-primary" href="#demo"><span ${t('hero.cta.demo')}></span>${icon('arrowRight', 'size-4')}</a>
              <a class="btn btn-secondary" href="${PAGES.docs}" ${t('hero.cta.docs')}></a>
            </div>
            <p class="mt-4"><a class="text-link" href="${REPO_URL}" rel="noopener"><span class="link-grow" ${t('hero.cta.github')}></span>${icon('arrowUpRight', 'size-4')}</a></p>
          </div>
          ${heroDemo()}
        </div>
      </section>

      <section id="demo" class="surface-sunken section-y" aria-labelledby="demo-title">
        <div class="shell">
        ${head('demo.eyebrow', 'demo.title', 'demo.lead', 'demo-title')}
        ${consoleMarkup('lite')}
        </div>
      </section>

      <section id="features" class="section-y" aria-labelledby="cap-title">
        <div class="shell">
        ${head('cap.eyebrow', 'cap.title', 'cap.lead', 'cap-title')}
          <div class="im-caps">
          <div class="im-caps-list">
          ${capabilityGroups()}
          </div>
          <aside class="im-stage" aria-hidden="true">
            <div class="im-stage-frame">
              <p class="im-stage-bar"><span class="im-dots"></span><span class="im-stage-tag mono"></span><span class="im-stage-count mono"></span></p>
              <div class="im-stage-view"></div>
              <p class="im-stage-title"></p>
            </div>
          </aside>
          </div>
          <p class="mt-6 text-sm text-muted-foreground"><span ${t('cap.captured')}></span> <time datetime="${SAMPLES.capturedOn}" data-date></time>.</p>
          <div id="cap-more" class="mt-12" hidden>
            <h3 class="mb-2" ${t('cap.more.title')}></h3>
            <p class="mb-6 text-sm text-muted-foreground" ${t('cap.more.lead')}></p>
            <ul id="cap-more-list" class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"></ul>
          </div>
        </div>
      </section>

      <div class="section-divider" aria-hidden="true"></div>

      <section id="proof" class="section-y" aria-labelledby="proof-title">
        <div class="shell">
        ${head('proof.eyebrow', 'proof.title', 'proof.lead', 'proof-title')}
          <ul class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            ${proof('security', 'shield', PAGES.security)}
            ${proof('measured', 'pulse', PAGES.playground)}
            ${proof('open', 'code', REPO_URL)}
            ${proof('scope', 'info', PAGES.limits)}
          </ul>
          ${labCards()}
        </div>
      </section>

      <section id="how" class="surface-sunken section-y" aria-labelledby="how-title">
        <div class="shell">
        ${head('how.eyebrow', 'how.title', 'how.lead', 'how-title')}
          <ol class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            ${step(1)}
            ${step(2)}
            ${step(3)}
          </ol>
          <div class="mb-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <article class="feature-card glass-strong" data-reveal>
              <span class="icon-tile mb-6">${icon('route', 'size-6')}</span>
              <h3 ${t('features.pipeline.title')}></h3>
              <p class="rich" ${t('features.pipeline.body')}></p>
              <ol class="pipeline">
                ${range('features.pipeline.step', 5)
                  .map((key) => key.replace('.step.', '.step'))
                  .map((key, at) => `<li${at === 3 ? ' class="optional"' : ''} ${t(key)}></li>`)
                  .join('')}
              </ol>
            </article>
            <article class="feature-card glass-strong" data-reveal>
              <span class="icon-tile mb-6">${icon('shield', 'size-6')}</span>
              <h3 ${t('features.ssrf.title')}></h3>
              <p class="rich" ${t('features.ssrf.body')}></p>
            </article>
          </div>
          <ul class="grid grid-cols-1 gap-6 md:grid-cols-3">
            ${feature('cache', 'stack')}
            ${feature('embed', 'image')}
            ${feature('errors', 'alert')}
          </ul>
        </div>
      </section>

      <section id="examples" class="section-y" aria-labelledby="int-title">
        <div class="shell">
        ${head('int.eyebrow', 'int.title', 'int.lead', 'int-title')}
          <div class="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
            <div class="usecase-tabs" role="tablist" aria-orientation="vertical" id="usecases" data-i18n-attr="aria-label:int.label">
              ${[1, 2, 3, 4]
                .map(
                  (n) =>
                    `<button type="button" class="usecase-tab" role="tab" id="uc-tab-${n}" aria-controls="uc-panel-${n}" aria-selected="${n === 1}"${n === 1 ? '' : ' tabindex="-1"'}><span class="usecase-title" ${t(`usecases.${n}.title`)}></span><span class="usecase-body" ${t(`usecases.${n}.body`)}></span></button>`,
                )
                .join('\n              ')}
            </div>
            <div class="min-w-0">
              ${USE_CASES.map(([lang, source], at) => `<div id="uc-panel-${at + 1}" role="tabpanel" aria-labelledby="uc-tab-${at + 1}" tabindex="0"${at === 0 ? '' : ' hidden'}>${codeFigure(['JavaScript', 'Python', 'curl', 'curl'][at] ?? 'curl', source, lang as 'js')}</div>`).join('\n              ')}
              <p class="rich mt-4 text-sm text-muted-foreground" ${t('int.more')}></p>
            </div>
          </div>
        </div>
      </section>

      <section id="tools" class="surface-sunken section-y" aria-labelledby="tools-title">
        <div class="shell">
        ${head('tools.eyebrow', 'tools.title', 'tools.lead', 'tools-title')}
          <ul class="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            ${tool('sdk', 'braces', PAGES.sdk, 'packages/sdk')}
            ${tool('element', 'link', `${PAGES.sdk}#element`, 'packages/sdk')}
            ${tool('react', 'code', `${PAGES.sdk}#react`, 'packages/react')}
            ${tool('cli', 'keyboard', '#cli', 'packages/cli')}
            ${tool('mcp', 'bot', `${PAGES['ai-agents']}#mcp`, 'packages/mcp')}
            ${tool('action', 'play', `${PAGES.sdk}#action`, '.github/actions')}
          </ul>
          <div id="cli" class="grid grid-cols-1 scroll-mt-28 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center" data-reveal>
            <div class="flex flex-col gap-3">
              <h3 ${t('cli.title')}></h3>
              <p class="rich text-muted-foreground" ${t('cli.lead')}></p>
              <p class="rich text-sm text-muted-foreground" ${t('cli.note')}></p>
            </div>
            <div class="grid min-w-0 grid-cols-1 gap-4">
              <div class="terminal">${codeFigure('cli.label', CLI_EXAMPLE, 'bash', true)}</div>
              ${
                SAMPLES.cli.meta === null
                  ? ''
                  : `<figure class="code"><figcaption class="code-head"><span class="mono normal-case tracking-normal">$ omnillink meta https://example.com/blog/launch</span></figcaption><pre tabindex="0" lang="en"><code>${escapeHtml(SAMPLES.cli.meta)}</code></pre></figure><p class="text-sm text-muted-foreground" ${t('cli.captured')}></p>`
              }
            </div>
          </div>
        </div>
      </section>

      <section id="self-host" class="section-y" aria-labelledby="self-host-title">
        <div class="shell">
        ${head('selfHost.eyebrow', 'selfHost.title', 'selfHost.lead', 'self-host-title')}
          <div class="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div class="flex min-w-0 flex-col gap-5">
              <ol class="steps flex flex-col gap-6">
                ${command(1, 'git clone https://github.com/kayzen-lyon/linkforge.git\ncd linkforge')}
                ${command(2, 'npm install\nnpx playwright-core install chromium')}
                ${command(3, 'cp .env.example .env')}
                ${command(4, 'npm run dev')}
              </ol>
              <p class="rich text-sm text-muted-foreground" ${t('selfHost.listening')}></p>
            </div>
            <div class="flex min-w-0 flex-col gap-8">
              ${fact(1)}
              ${fact(2)}
              ${fact(3)}
              <p class="flex flex-wrap gap-3"><a class="btn btn-secondary" href="${PAGES['self-hosting']}" ${t('tools.guide')}></a><a class="btn btn-secondary" href="${REPO_URL}" rel="noopener"><span ${t('selfHost.cta')}></span>${icon('arrowUpRight', 'size-4')}</a></p>
            </div>
          </div>
          <div class="mt-16" data-reveal>
            <h3 class="mb-2" id="vs-title" ${t('vs.title')}></h3>
            <p class="mb-6 text-muted-foreground" ${t('vs.lead')}></p>
            <div class="ref-table-wrap"><table class="ref-table ref-table-plain" aria-labelledby="vs-title">
              <thead><tr><th scope="col" ${t('vs.h.topic')}></th><th scope="col" ${t('vs.h.own')}></th><th scope="col" ${t('vs.h.hosted')}></th></tr></thead>
              <tbody>${[1, 2, 3, 4, 5].map(versus).join('')}</tbody>
            </table></div>
          </div>
        </div>
      </section>

      <section id="faq" class="surface-sunken section-y" aria-labelledby="faq-title">
        <div class="mx-auto max-w-4xl px-4 sm:px-6">
          <div class="section-head" data-reveal>
            <p class="eyebrow" ${t('faq.eyebrow')}></p>
            <h2 id="faq-title" ${t('faq.title')}></h2>
          </div>
          <div class="faq">
            ${faq}
          </div>
        </div>
      </section>

      <section class="im-cta" aria-labelledby="cta-title">
        <div class="cta-band flex flex-col gap-6 px-6 py-12 md:px-12 md:py-16" data-reveal>
          <h2 id="cta-title" class="max-w-3xl" ${t('cta.title')}></h2>
          <p class="max-w-2xl text-lg" ${t('cta.lead')}></p>
          <div class="flex flex-col gap-3 sm:flex-row">
            <a class="btn btn-primary" href="${PAGES.playground}"><span ${t('hero.cta.demo')}></span>${icon('arrowRight', 'size-4')}</a>
            <a class="btn btn-on-navy" href="${PAGES.docs}" ${t('hero.cta.docs')}></a>
            <a class="btn btn-on-navy" href="${REPO_URL}" rel="noopener"><span ${t('hero.cta.github')}></span>${icon('arrowUpRight', 'size-4')}</a>
          </div>
        </div>
      </section>
    </main>`;
}

// ---- Documentation -------------------------------------------------------------------------

/** Sidebar shared by the reference and the guides: the list of guides, then the page's own sections. */
function docsSidebar(page: PageId, lang: Lang, own: string): string {
  const guides = GUIDE_LIST.map(
    (guide) => `<li><a class="toc-link"${guide.id === page ? ' aria-current="page"' : ''} href="${PAGES[guide.id]}">${escapeHtml(guide.nav[lang])}</a></li>`,
  ).join('');
  return `<div class="toc-group">
            <p class="toc-title" ${t('nav.guides')}></p>
            <ul>${guides}
              <li><a class="toc-link"${page === 'docs' ? ' aria-current="page"' : ''} href="${PAGES.docs}" ${t('nav.docs')}></a></li>
              <li><a class="toc-link" href="${PAGES.playground}" ${t('nav.playground')}></a></li>
            </ul>
          </div>
          ${own}`;
}

function docsShell(page: PageId, lang: Lang, own: string, main: string, cls: string): string {
  const nav = docsSidebar(page, lang, own);
  return `<div class="page-main">
      <div class="shell lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <details class="toc-mobile" id="toc-mobile">
          <summary ${t('guide.onThisPage')}></summary>
          <nav class="toc-mobile-body" data-i18n-attr="aria-label:guide.onThisPage">${nav}</nav>
        </details>
        <aside class="toc-side">
          <nav class="pt-8" data-i18n-attr="aria-label:guide.onThisPage">${nav}</nav>
        </aside>
        <main id="main" class="${cls} rich pt-10 pb-8 lg:pt-14" tabindex="-1">
          ${main}
        </main>
      </div>
    </div>`;
}

function reference(lang: Lang): string {
  return docsShell(
    'docs',
    lang,
    renderDocsNav(),
    `<header class="flex flex-col gap-4 pb-10">
            ${breadcrumb('title')}
            <h1 ${t('title')}></h1>
            <p class="lead" ${t('lead')}></p>
            <p class="flex flex-wrap gap-3"><a class="btn btn-primary btn-compact" href="${PAGES.playground}"><span ${t('nav.playground')}></span>${icon('arrowRight', 'size-4')}</a><a class="btn btn-secondary btn-compact" href="/api/v1/openapi.json">${icon('download', 'size-4')}<span>openapi.json</span></a></p>
          </header>
          ${renderDocsBody(lang)}`,
    'doc',
  );
}

function guidePage(guide: Guide, lang: Lang): string {
  const headings = guideHeadings(guide, lang);
  const own =
    headings.length === 0
      ? ''
      : `<div class="toc-group"><p class="toc-title" ${t('guide.onThisPage')}></p><ul>${headings.map((item) => `<li><a class="toc-link" data-spy href="#${item.id}">${escapeHtml(item.text)}</a></li>`).join('')}</ul></div>`;
  const at = GUIDE_LIST.indexOf(guide);
  const next = GUIDE_LIST[at + 1];
  return docsShell(
    guide.id,
    lang,
    own,
    `<header class="flex flex-col gap-4 pb-8">
            ${breadcrumb('title', [[PAGES.quickstart, 'nav.guides']])}
            <h1 ${t('title')}></h1>
            <p class="lead" ${t('lead')}></p>
          </header>
          <div class="guide-body">
          ${renderGuideBody(guide, lang)}
          </div>
          <footer class="guide-foot">
            <a class="text-link text-link-quiet" href="${REPO_WEB_DIR}/src/content/guides.ts" rel="noopener">${icon('pencil', 'size-4')}<span class="link-grow" ${t('guide.edit')}></span></a>
            ${next === undefined ? '' : `<a class="btn btn-secondary btn-compact" href="${PAGES[next.id]}"><span><span ${t('guide.next')}></span> : ${escapeHtml(next.nav[lang])}</span>${icon('arrowRight', 'size-4')}</a>`}
          </footer>`,
    'doc guide',
  );
}

// ---- Playground, status, text pages -----------------------------------------------------------

function playground(): string {
  const tip = (n: number, name: IconName): string =>
    `<li class="flex gap-4"><span class="icon-tile icon-tile-sm">${icon(name, 'size-4')}</span><div><h3 class="text-base! font-bold!" ${t(`tips.${n}.title`)}></h3><p class="rich text-sm text-muted-foreground" ${t(`tips.${n}.body`)}></p></div></li>`;
  return `<main id="main" class="page-main" tabindex="-1">
      <div class="shell pt-10 pb-8 md:pt-14">
        <header class="mb-8 flex flex-col gap-4">
          ${breadcrumb('title')}
          <h1 class="h1-page" ${t('title')}></h1>
          <p class="lead rich" ${t('lead')}></p>
          <p class="note max-w-[68ch] text-sm">${icon('shield', 'mr-2 inline size-4')}<span ${t('privacy')}></span></p>
        </header>
        ${consoleMarkup('full')}
        <section class="mt-16" aria-labelledby="tips-title">
          <h2 id="tips-title" class="h2-page mb-8" ${t('tips.title')}></h2>
          <ul class="grid gap-8 md:grid-cols-2">
            ${tip(1, 'share')}
            ${tip(2, 'list')}
            ${tip(3, 'camera')}
            ${tip(4, 'download')}
          </ul>
          <p class="mt-8 flex flex-wrap gap-3">
            <a class="btn btn-secondary btn-compact" href="/api/v1/openapi.json" download="omnillink-openapi.json">${icon('download', 'size-4')}<span ${t('dl.openapi')}></span></a>
            <button type="button" id="dl-postman" class="btn btn-secondary btn-compact">${icon('download', 'size-4')}<span ${t('dl.postman')}></span></button>
            <button type="button" id="dl-bruno" class="btn btn-secondary btn-compact">${icon('download', 'size-4')}<span ${t('dl.bruno')}></span></button>
          </p>
        </section>
      </div>
    </main>`;
}

function status(): string {
  return `<main id="main" class="page-main" tabindex="-1">
      <div class="mx-auto max-w-4xl px-4 pt-10 pb-8 sm:px-6 md:pt-14">
        <header class="mb-8 flex flex-col gap-4">
          ${breadcrumb('title')}
          <h1 class="h1-page" ${t('title')}></h1>
          <p class="lead rich" ${t('lead')}></p>
        </header>
        <section class="status-card glass-premium" aria-live="polite" aria-busy="true" id="status-card">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <p class="status-state" id="status-state" data-state="checking"><span class="status-dot" aria-hidden="true"></span><span id="status-text" ${t('checking')}></span></p>
            <button type="button" id="status-refresh" class="btn btn-secondary btn-compact">${icon('refresh', 'size-4')}<span ${t('refresh')}></span></button>
          </div>
          <p id="status-time" class="text-sm text-muted-foreground"></p>
          <dl id="status-facts" class="status-facts"></dl>
        </section>
        <section class="mt-10 flex flex-col gap-4" aria-labelledby="status-raw-title">
          <h2 id="status-raw-title" class="h2-page rich" ${t('raw')}></h2>
          <figure class="code"><pre tabindex="0"><code id="status-raw">–</code></pre></figure>
          <p class="rich text-sm text-muted-foreground" ${t('note')}></p>
        </section>
      </div>
    </main>`;
}

function prosePage(body: string): string {
  return `<main id="main" class="page-main" tabindex="-1">
      <div class="prose-page rich mx-auto max-w-4xl px-4 pt-10 pb-8 sm:px-6 md:pt-14">
        <header class="flex flex-col gap-4 pb-10">
          ${breadcrumb('title')}
          <h1 ${t('title')}></h1>
          <p class="text-sm text-muted-foreground" ${t('updated')}></p>
${body}
      </div>
    </main>`;
}

interface LabRun {
  readonly page: 'home' | 'playground' | 'docs';
  readonly form: 'desktop' | 'mobile';
  readonly performance: number;
  readonly accessibility: number;
  readonly bestPractices: number;
  readonly seo: number;
}
/** Scores written by scripts/lighthouse.mjs; absent until that script has run. */
const LAB = ((): { readonly measuredOn: string; readonly lighthouse: string; readonly chrome: string; readonly runs: readonly LabRun[] } | null => {
  try {
    return JSON.parse(readFileSync(new URL('../content/lighthouse.json', import.meta.url), 'utf8'));
  } catch {
    return null;
  }
})();

/** The measured Lighthouse scores, labelled as a lab run on a local build. Empty when nothing was measured. */
function labScores(): string {
  if (LAB === null || LAB.runs.length === 0) return '';
  const cell = (key: string, value: number): string => `<td class="mono"><span class="cell-label" ${t(`lab.th.${key}`)}></span>${value}</td>`;
  return `<div class="lab-scores">
            <div class="ref-table-wrap"><table class="ref-table ref-table-plain">
              <caption class="sr-only" ${t('lab.caption')}></caption>
              <thead><tr><th scope="col" ${t('lab.th.page')}></th><th scope="col" ${t('lab.th.screen')}></th><th scope="col" ${t('lab.th.performance')}></th><th scope="col" ${t('lab.th.accessibility')}></th><th scope="col" ${t('lab.th.practices')}></th><th scope="col" ${t('lab.th.seo')}></th></tr></thead>
              <tbody>${LAB.runs.map((run) => `<tr><th scope="row" ${t(`lab.page.${run.page}`)}></th><td ${t(`lab.form.${run.form}`)}></td>${cell('performance', run.performance)}${cell('accessibility', run.accessibility)}${cell('practices', run.bestPractices)}${cell('seo', run.seo)}</tr>`).join('')}</tbody>
            </table></div>
            <p class="lab-meta mono">Lighthouse ${escapeHtml(LAB.lighthouse)} · Chromium ${escapeHtml(LAB.chrome)} · <time datetime="${escapeHtml(LAB.measuredOn)}">${escapeHtml(LAB.measuredOn)}</time></p>
            <p class="rich lab-note" ${t('lab.note')}></p>
          </div>`;
}

/**
 * The same scores on the landing page: one card per measured page, with a whole
 * capture of that page (scripts/capture-site.mjs) and its eight scores as rings.
 */
function labCards(): string {
  if (LAB === null || LAB.runs.length === 0) return '';
  const lab = LAB;
  const ring = (key: string, value: number): string =>
    `<li class="im-ring"><svg viewBox="0 0 44 44" aria-hidden="true" focusable="false"><circle class="im-ring-track" cx="22" cy="22" r="19" /><circle class="im-ring-value" cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="${value} 100" /></svg><span class="im-ring-n mono">${value}</span><span class="im-ring-l" ${t(`lab.th.${key}`)}></span></li>`;
  const row = (run: LabRun): string =>
    `<div class="im-score-row"><dt ${t(`lab.form.${run.form}`)}></dt><dd><ul>${ring('performance', run.performance)}${ring('accessibility', run.accessibility)}${ring('practices', run.bestPractices)}${ring('seo', run.seo)}</ul></dd></div>`;
  const stamp = `<time datetime="${escapeHtml(lab.measuredOn)}">${escapeHtml(lab.measuredOn)}</time>`;
  const card = (page: 'home' | 'playground' | 'docs', link: string): string =>
    `<li class="im-proof">
              <figure class="im-browser">
                <p class="im-browser-bar" aria-hidden="true"><span class="im-dots"></span><span class="mono">${escapeHtml(`${SITE_ORIGIN.replace('https://', '')}${PAGES[page]}`)}</span></p>
                <img src="/samples/site-${page}.webp" alt="" width="960" height="540" loading="lazy" decoding="async" />
              </figure>
              <div class="im-proof-body">
                <h4 ${t(`lab.page.${page}`)}></h4>
                <dl class="im-scores">${lab.runs.filter((run) => run.page === page).map(row).join('')}</dl>
                <p class="lab-meta mono">Lighthouse ${escapeHtml(lab.lighthouse)} · ${stamp}</p>
                ${link === '' ? '' : `<p><a class="text-link" href="${PAGES[page]}"><span class="link-grow" ${t(link)}></span>${icon('arrowRight', 'size-4')}</a></p>`}
              </div>
            </li>`;
  return `<div class="im-proofs">
            <h3 class="lab-title" ${t('lab.title')}></h3>
            <p class="sr-only" ${t('lab.caption')}></p>
            <ol class="im-proof-list">
            ${card('home', '')}
            ${card('playground', 'nav.playground')}
            ${card('docs', 'nav.docs')}
            </ol>
            <p class="lab-meta mono">Lighthouse ${escapeHtml(lab.lighthouse)} · Chromium ${escapeHtml(lab.chrome)} · ${stamp}</p>
            <p class="rich lab-note" ${t('lab.note')}></p>
          </div>`;
}

const section = (title: string, inner: string, id: string): string =>
  `<section aria-labelledby="${id}"><h2 id="${id}" ${t(title)}></h2>${inner}</section>`;
const disclaimer = `<p class="border-t border-border pt-6 text-sm text-muted-foreground" ${t('disclaimer')}></p>`;

function accessibility(): string {
  return prosePage(
    [
      p('intro', 'lead'),
      p('notice', 'note'),
      '</header>',
      section('built.title', list(range('built', 9)), 'a-built'),
      section('checked.title', p('checked.intro') + list(range('checked', 5)), 'a-checked'),
      ...(labScores() === '' ? [] : [section('lab.title', labScores(), 'a-lab')]),
      section('unchecked.title', list(range('unchecked', 5)), 'a-unchecked'),
      section('limits.title', list(range('limits', 4)), 'a-limits'),
      section('settings.title', p('settings.p'), 'a-settings'),
      section('contact.title', p('contact.p') + list(['contact.email', 'contact.phone', 'contact.issues']), 'a-contact'),
      disclaimer,
    ].join('\n'),
  );
}

function legal(): string {
  const row = (key: string, text: string): string => `<tr><th scope="row"><code class="param-name">omnillink-${key}</code></th><td ${t(text)}></td></tr>`;
  const storage = `<div class="ref-table-wrap"><table class="ref-table ref-table-plain">
            <thead><tr><th scope="col" ${t('storage.th.key')}></th><th scope="col" ${t('storage.th.purpose')}></th></tr></thead>
            <tbody>${row('theme', 'storage.theme')}${row('lang', 'storage.lang')}${row('a11y', 'storage.a11y')}${row('banner', 'storage.banner')}${row('history', 'storage.history')}</tbody>
          </table></div>`;
  return prosePage(
    [
      p('intro', 'lead'),
      '</header>',
      section(
        'publisher.title',
        p('publisher.p') + list(['form', 'seat', 'office', 'siret', 'siren', 'ape', 'vat', 'phone', 'email'].map((key) => `publisher.${key}`), 'plain-list'),
        'l-publisher',
      ),
      section('director.title', p('director.p'), 'l-director'),
      section('host.title', p('host.p'), 'l-host'),
      section('software.title', p('software.p'), 'l-software'),
      section(
        'privacy.title',
        `${p('privacy.none')}<h3 ${t('storage.title')}></h3>${p('storage.p')}${storage}<h3 ${t('demo.title')}></h3>${list(range('demo', 3))}<h3 ${t('logs.title')}></h3>${p('logs.p')}`,
        'l-privacy',
      ),
      section('rights.title', p('rights.p'), 'l-rights'),
      disclaimer,
    ].join('\n'),
  );
}

function notFound(): string {
  const link = (href: string, key: string, name: IconName): string =>
    `<li><a class="menu-link" href="${href}"><span class="flex items-center gap-3">${icon(name, 'size-5')}<span ${t(key)}></span></span>${icon('arrowRight', 'size-4 shrink-0')}</a></li>`;
  return `<main id="main" class="page-main" tabindex="-1">
      <div class="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-24">
        <p class="eyebrow mb-5">404</p>
        <h1 class="h1-page mb-5" ${t('nf.title')}></h1>
        <p class="lead mb-8" ${t('nf.lead')}></p>
        <p class="mb-8"><button type="button" class="btn btn-primary" data-open-search>${icon('search', 'size-4')}<span ${t('nf.search')}></span></button></p>
        <ul class="mb-8 flex flex-col">
          ${link('/', 'nf.home', 'arrowUp')}
          ${link(PAGES.playground, 'nf.playground', 'play')}
          ${link(PAGES.quickstart, 'nf.quickstart', 'book')}
          ${link(PAGES.docs, 'nf.docs', 'braces')}
          ${link(PAGES.status, 'nf.status', 'pulse')}
        </ul>
        <p class="rich text-sm text-muted-foreground" ${t('nf.api')}></p>
      </div>
    </main>`;
}

function offline(): string {
  return `<main id="main" class="page-main" tabindex="-1">
      <div class="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-24">
        <span class="icon-tile mb-6">${icon('alert', 'size-6')}</span>
        <h1 class="h1-page mb-5" ${t('off.title')}></h1>
        <p class="lead mb-8" ${t('off.lead')}></p>
        <p><a class="btn btn-primary" href="" data-reload>${icon('refresh', 'size-4')}<span ${t('off.retry')}></span></a></p>
      </div>
    </main>`;
}

/** Which page script each page loads (`src/entries/<kind>.<lang>.ts`). */
export type EntryKind = 'home' | 'docs' | 'playground' | 'status' | 'a11y' | 'legal' | 'plain';

export function entryOf(page: PageId): EntryKind {
  if (page === 'home' || page === 'docs' || page === 'playground' || page === 'status' || page === 'legal') return page;
  if (page === 'accessibility') return 'a11y';
  return 'plain';
}

export const guideOf = (page: PageId): Guide | undefined => GUIDE_LIST.find((guide) => guide.id === (page as GuideId));

export function pageBody(page: PageId, lang: Lang): string {
  const guide = guideOf(page);
  if (guide !== undefined) return guidePage(guide, lang);
  switch (page) {
    case 'home':
      return home();
    case 'docs':
      return reference(lang);
    case 'playground':
      return playground();
    case 'status':
      return status();
    case 'accessibility':
      return accessibility();
    case 'legal':
      return legal();
    case 'offline':
      return offline();
    default:
      return notFound();
  }
}
