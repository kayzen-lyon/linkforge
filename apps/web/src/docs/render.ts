/**
 * Build-time renderer of the API reference (pure string output, no DOM).
 *
 * Text elements are emitted empty with a `data-i18n` key; the Vite plugin
 * fills them in French and the client can re-translate them. Code samples are
 * tokenised here so the page needs no highlighter at runtime.
 */
import { tokenize, type Lang } from '../lib/highlight';
import { escapeHtml, inlineToHtml } from '../lib/inline';
import {
  AUTH_SAMPLE,
  ENDPOINTS,
  ENVELOPE_SAMPLE,
  ERRORS,
  ERROR_SAMPLE,
  HEALTH_RESPONSE,
  HEALTH_SAMPLE,
  OPENAPI_SAMPLE,
  QUICK_START,
  type CommonKey,
  type DocsKey,
  type Endpoint,
  type FieldTable,
  type Row,
} from './spec';

type Key = DocsKey | CommonKey;

const t = (key: Key): string => `data-i18n="${key}"`;
const p = (key: Key): string => `<p ${t(key)}></p>`;

let codeCounter = 0;

function highlight(code: string, lang: Lang): string {
  return tokenize(code, lang)
    .map((token) =>
      token.type === 'plain'
        ? escapeHtml(token.text)
        : `<span class="t-${token.type}">${escapeHtml(token.text)}</span>`,
    )
    .join('');
}

function codeBlock(label: DocsKey, code: string, lang: Lang): string {
  codeCounter += 1;
  const id = `code-${codeCounter}`;
  return `<figure class="code">
  <figcaption class="code-head">
    <span ${t(label)}></span>
    <button type="button" class="copy-btn" data-copy="#${id}"><span data-copy-label ${t('copy')}></span></button>
  </figcaption>
  <pre tabindex="0"><code id="${id}">${highlight(code, lang)}</code></pre>
</figure>`;
}

function rowsTable(nameHeader: DocsKey, rows: readonly Row[], defaults: boolean): string {
  const body = rows
    .map((row) => {
      const required = row.required === true ? ` <span class="req" ${t('required')}></span>` : '';
      const fallback = defaults
        ? `<td class="cell-default"><span class="cell-label" ${t('th.default')}></span>${row.fallback === undefined ? '<span aria-hidden="true">–</span>' : inlineToHtml(row.fallback)}</td>`
        : '';
      return `<tr>
      <th scope="row"><code class="param-name">${escapeHtml(row.name)}</code>${required}</th>
      <td class="cell-type">${inlineToHtml(row.type)}</td>
      ${fallback}
      <td ${t(row.description)}></td>
    </tr>`;
    })
    .join('\n');

  return `<div class="ref-table-wrap"><table class="ref-table">
  <thead><tr>
    <th scope="col" ${t(nameHeader)}></th>
    <th scope="col" ${t('th.type')}></th>
    ${defaults ? `<th scope="col" ${t('th.default')}></th>` : ''}
    <th scope="col" ${t('th.description')}></th>
  </tr></thead>
  <tbody>
${body}
  </tbody>
</table></div>`;
}

function extraTable(table: FieldTable): string {
  return `<h4 ${t(table.title)}></h4>\n${rowsTable(table.nameHeader, table.rows, table.defaults)}`;
}

function endpointHead(id: string, path: string, title: DocsKey, returns: string): string {
  return `<header class="endpoint-head">
    <h3 id="${id}" ${t(title)}></h3>
    <p class="endpoint-line"><span class="method">GET</span><code>${escapeHtml(path)}</code></p>
    <p class="endpoint-returns"><span ${t('returns')}></span> ${inlineToHtml(returns)}</p>
  </header>`;
}

function endpointSection(endpoint: Endpoint): string {
  return `<section class="endpoint" aria-labelledby="${endpoint.id}">
  ${endpointHead(endpoint.id, endpoint.path, endpoint.title, endpoint.returns)}
  ${endpoint.intro.map(p).join('\n  ')}
  <h4 ${t('params')}></h4>
  ${rowsTable('th.param', endpoint.params, true)}
  ${(endpoint.tables ?? []).map(extraTable).join('\n')}
  ${(endpoint.notes ?? []).map((key) => `<p class="note" ${t(key)}></p>`).join('\n')}
  ${endpoint.samples.map((sample) => codeBlock(sample.label, sample.code, sample.lang)).join('\n')}
</section>`;
}

function simpleTable(nameHeader: DocsKey, rows: ReadonlyArray<readonly [string, string, DocsKey]>): string {
  return rowsTable(
    nameHeader,
    rows.map(([name, type, description]) => ({ name, type, description })),
    false,
  );
}

function headerTable(rows: ReadonlyArray<readonly [string, DocsKey]>): string {
  return `<div class="ref-table-wrap"><table class="ref-table">
  <thead><tr><th scope="col" ${t('th.header')}></th><th scope="col" ${t('th.description')}></th></tr></thead>
  <tbody>
${rows.map(([name, key]) => `    <tr><th scope="row"><code class="param-name">${name}</code></th><td ${t(key)}></td></tr>`).join('\n')}
  </tbody>
</table></div>`;
}

function errorTable(): string {
  return `<div class="ref-table-wrap"><table class="ref-table">
  <thead><tr><th scope="col" ${t('th.code')}></th><th scope="col" ${t('th.http')}></th><th scope="col"><code>status</code></th><th scope="col" ${t('th.meaning')}></th></tr></thead>
  <tbody>
${ERRORS.map(
  (row) => `    <tr>
      <th scope="row"><code class="param-name">${row.code}</code></th>
      <td class="cell-type"><span class="cell-label">HTTP</span><span class="http http-${row.http.charAt(0)}">${row.http}</span></td>
      <td class="cell-type"><code>${Number(row.http) >= 500 ? 'error' : 'fail'}</code></td>
      <td ${t(row.meaning)}></td>
    </tr>`,
).join('\n')}
  </tbody>
</table></div>`;
}

interface TocGroup {
  readonly title: DocsKey;
  readonly items: ReadonlyArray<{ readonly id: string; readonly key?: DocsKey; readonly code?: string }>;
}

const TOC: readonly TocGroup[] = [
  {
    title: 'toc.basics',
    items: [
      { id: 'quick-start', key: 'quickstart.title' },
      { id: 'authentication', key: 'auth.title' },
      { id: 'rate-limits', key: 'limits.title' },
      { id: 'response-format', key: 'format.title' },
      { id: 'caching', key: 'cache.title' },
      { id: 'rendering', key: 'render.title' },
    ],
  },
  {
    title: 'toc.endpoints',
    items: [
      ...ENDPOINTS.map((endpoint) => ({ id: endpoint.id, code: endpoint.path.replace('/api/v1', '') })),
      { id: 'openapi', code: '/openapi.json' },
      { id: 'health', code: '/health' },
    ],
  },
  {
    title: 'toc.reference',
    items: [
      { id: 'errors', key: 'errors.title' },
      { id: 'security', key: 'security.title' },
    ],
  },
];

/** The in-page navigation (rendered once, shown as a sidebar or a disclosure). */
export function renderDocsNav(): string {
  return TOC.map(
    (group) => `<div class="toc-group">
  <p class="toc-title" ${t(group.title)}></p>
  <ul>
${group.items
  .map((item) =>
    item.key === undefined
      ? `    <li><a class="toc-link" href="#${item.id}"><code>${item.code ?? ''}</code></a></li>`
      : `    <li><a class="toc-link" href="#${item.id}" ${t(item.key)}></a></li>`,
  )
  .join('\n')}
  </ul>
</div>`,
  ).join('\n');
}

const section = (id: string, title: DocsKey, body: string): string =>
  `<section class="doc-section" aria-labelledby="${id}">
  <h2 id="${id}" ${t(title)}></h2>
  ${body}
</section>`;

export function renderDocsBody(): string {
  codeCounter = 0;
  return [
    section(
      'quick-start',
      'quickstart.title',
      [p('quickstart.p1'), codeBlock('sample.request', QUICK_START, 'bash'), p('quickstart.p2')].join('\n'),
    ),
    section(
      'authentication',
      'auth.title',
      [p('auth.p1'), codeBlock('sample.request', AUTH_SAMPLE, 'bash'), p('auth.p2')].join('\n'),
    ),
    section(
      'rate-limits',
      'limits.title',
      [
        p('limits.p1'),
        p('limits.p2'),
        headerTable([
          ['x-ratelimit-limit', 'limits.h.limit'],
          ['x-ratelimit-remaining', 'limits.h.remaining'],
          ['x-ratelimit-reset', 'limits.h.reset'],
          ['retry-after', 'limits.h.retry'],
        ]),
        p('limits.p3'),
      ].join('\n'),
    ),
    section(
      'response-format',
      'format.title',
      [
        p('format.p1'),
        codeBlock('sample.response', ENVELOPE_SAMPLE, 'json'),
        simpleTable('th.field', [
          ['meta.cached', '`boolean`', 'format.cached'],
          ['meta.source', '`http` | `browser`', 'format.source'],
          ['meta.durationMs', '`integer`', 'format.duration'],
        ]),
        p('format.p2'),
        codeBlock('sample.response', ERROR_SAMPLE, 'json'),
      ].join('\n'),
    ),
    section('caching', 'cache.title', [p('cache.p1'), p('cache.p2'), p('cache.p3'), p('cache.p4')].join('\n')),
    section('rendering', 'render.title', [p('render.p1'), p('render.p2'), p('render.p3')].join('\n')),
    `<section class="doc-section" aria-labelledby="endpoints">
  <h2 id="endpoints" ${t('toc.endpoints')}></h2>
  ${ENDPOINTS.map(endpointSection).join('\n')}
  <section class="endpoint" aria-labelledby="openapi">
    ${endpointHead('openapi', '/api/v1/openapi.json', 'openapi.h', '`application/json`')}
    ${p('openapi.p1')}
    ${codeBlock('sample.request', OPENAPI_SAMPLE, 'bash')}
  </section>
  <section class="endpoint" aria-labelledby="health">
    ${endpointHead('health', '/health', 'health.h', '`application/json`')}
    ${p('health.p1')}
    ${codeBlock('sample.request', HEALTH_SAMPLE, 'bash')}
    ${codeBlock('sample.response', HEALTH_RESPONSE, 'json')}
  </section>
</section>`,
    section('errors', 'errors.title', [p('errors.p1'), codeBlock('sample.response', ERROR_SAMPLE, 'json'), errorTable()].join('\n')),
    section(
      'security',
      'security.title',
      [
        p('security.p1'),
        `<ul class="doc-list">${(['security.li1', 'security.li2', 'security.li3', 'security.li4', 'security.li5'] as const)
          .map((key) => `<li ${t(key)}></li>`)
          .join('')}</ul>`,
        p('security.p2'),
      ].join('\n'),
    ),
  ].join('\n\n');
}
