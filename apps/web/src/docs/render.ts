/**
 * Build-time renderer of the API reference (pure string output, no DOM).
 *
 * Text elements are emitted empty with a `data-i18n` key; the Vite plugin
 * fills them in French and the client can re-translate them. Code samples are
 * tokenised here so the page needs no highlighter at runtime.
 */
import { readFileSync } from 'node:fs';

import { codeFigure, resetCodeCounter } from '../content/render.ts';
import type { Lang } from '../lib/highlight.ts';
import { escapeHtml, inlineToHtml } from '../lib/inline.ts';
import { SITE_ORIGIN } from '../site/config.ts';
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
} from './spec.ts';

type Key = DocsKey | CommonKey;

const t = (key: Key): string => `data-i18n="${key}"`;
const p = (key: Key): string => `<p ${t(key)}></p>`;

const codeBlock = (label: DocsKey, code: string, lang: Lang): string => codeFigure(label, code, lang, true);

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
  ${extraParams(endpoint)}
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

// ---- Endpoints documented straight from the OpenAPI document --------------------------------

interface SpecParam {
  readonly name: string;
  readonly required: boolean;
  readonly type: string;
  readonly fallback: string;
  readonly description: string;
}
interface SpecOperation {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly summary: string;
  readonly description: string;
  readonly produces: readonly string[];
  readonly params: readonly SpecParam[];
}
type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function typeOf(schema: Json): string {
  if (Array.isArray(schema['enum'])) return schema['enum'].map((item) => `\`${String(item)}\``).join(' | ');
  const bounds = typeof schema['minimum'] === 'number' || typeof schema['maximum'] === 'number' ? ` ${String(schema['minimum'] ?? '')}–${String(schema['maximum'] ?? '')}` : '';
  return `\`${text(schema['type']) || 'string'}\`${bounds}`;
}

/**
 * The snapshot is written by scripts/capture-samples.py from a running API.
 * Every endpoint and parameter the hand-written reference does not cover is
 * rendered from it, in the document's own (English) wording, so the page
 * cannot fall behind the API.
 */
function specOperations(): SpecOperation[] {
  const document = JSON.parse(readFileSync(new URL('./openapi.snapshot.json', import.meta.url), 'utf8')) as Json;
  const paths = isObject(document['paths']) ? document['paths'] : {};
  const operations: SpecOperation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    for (const [method, operation] of Object.entries(item)) {
      if (!isObject(operation)) continue;
      const params: SpecParam[] = [];
      for (const parameter of Array.isArray(operation['parameters']) ? operation['parameters'] : []) {
        if (!isObject(parameter)) continue;
        const schema = isObject(parameter['schema']) ? parameter['schema'] : {};
        params.push({ name: text(parameter['name']), required: parameter['required'] === true, type: typeOf(schema), fallback: schema['default'] === undefined ? '' : String(schema['default']), description: text(parameter['description']) || text(schema['description']) });
      }
      const body = isObject(operation['requestBody']) && isObject(operation['requestBody']['content']) ? operation['requestBody']['content']['application/json'] : undefined;
      const schema = isObject(body) && isObject(body['schema']) ? body['schema'] : {};
      const required = Array.isArray(schema['required']) ? schema['required'] : [];
      for (const [name, property] of Object.entries(isObject(schema['properties']) ? schema['properties'] : {})) {
        if (isObject(property)) params.push({ name, required: required.includes(name), type: typeOf(property), fallback: property['default'] === undefined ? '' : String(property['default']), description: text(property['description']) });
      }
      const success = Object.entries(isObject(operation['responses']) ? operation['responses'] : {}).find(([status]) => status.startsWith('2'))?.[1];
      operations.push({
        id: path.replace(/^\/api\/v\d+\//, '').replace(/^\//, '').replace(/\W+/g, '-'),
        method: method.toUpperCase(),
        path,
        summary: text(operation['summary']),
        description: text(operation['description']),
        produces: isObject(success) && isObject(success['content']) ? Object.keys(success['content']) : [],
        params,
      });
    }
  }
  return operations;
}

const HAND_WRITTEN = new Set(ENDPOINTS.map((endpoint) => endpoint.path));
const SKIPPED = new Set(['/api/v1/openapi.json', '/health']);
const SPEC = specOperations();
/** Endpoints documented from the OpenAPI document only. */
export const SPEC_ENDPOINTS: readonly SpecOperation[] = SPEC.filter((operation) => !HAND_WRITTEN.has(operation.path) && !SKIPPED.has(operation.path));

function specTable(params: readonly SpecParam[]): string {
  if (params.length === 0) return '';
  return `<div class="ref-table-wrap"><table class="ref-table" lang="en">
  <thead><tr><th scope="col" ${t('th.param')}></th><th scope="col" ${t('th.type')}></th><th scope="col" ${t('th.default')}></th><th scope="col" ${t('th.description')}></th></tr></thead>
  <tbody>
${params
  .map(
    (row) => `    <tr>
      <th scope="row"><code class="param-name">${escapeHtml(row.name)}</code>${row.required ? ` <span class="req" lang="" ${t('required')}></span>` : ''}</th>
      <td class="cell-type">${inlineToHtml(row.type)}</td>
      <td class="cell-default">${row.fallback === '' ? '<span aria-hidden="true">–</span>' : `<code>${escapeHtml(row.fallback)}</code>`}</td>
      <td>${inlineToHtml(row.description)}</td>
    </tr>`,
  )
  .join('\n')}
  </tbody>
</table></div>`;
}

function specSample(operation: SpecOperation): string {
  const url = `${SITE_ORIGIN}${operation.path}`;
  if (operation.method === 'POST') {
    const body = operation.path.endsWith('/mcp') ? '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' : '{"urls":["https://example.com/blog/launch"]}';
    return `curl -X POST "${url}" \\\n  -H "content-type: application/json" \\\n  -d '${body}'`;
  }
  const required = operation.params.filter((row) => row.required).map((row) => `${row.name}=${row.name === 'url' ? encodeURIComponent('https://example.com/blog/launch') : 'Omnillink'}`);
  const binary = operation.produces.length > 0 && operation.produces.every((type) => /image|pdf/.test(type));
  return `curl${binary ? ` -o ${operation.id}.${operation.produces[0]?.includes('svg') ? 'svg' : operation.produces[0]?.includes('apng') ? 'png' : (operation.produces[0]?.split('/')[1] ?? 'bin')}` : ''} "${url}${required.length === 0 ? '' : `?${required.join('&')}`}"`;
}

function specSection(operation: SpecOperation): string {
  return `<section class="endpoint" aria-labelledby="${operation.id}">
  <header class="endpoint-head">
    <h3 id="${operation.id}" lang="en">${escapeHtml(operation.summary)}</h3>
    <p class="endpoint-line"><span class="method">${operation.method}</span><code>${escapeHtml(operation.path)}</code></p>
    <p class="endpoint-returns"><span ${t('returns')}></span> ${operation.produces.map((type) => `<code>${escapeHtml(type)}</code>`).join(' | ')}</p>
  </header>
  ${operation.description === '' ? '' : `<p lang="en">${inlineToHtml(operation.description)}</p>`}
  ${operation.params.length === 0 ? '' : `<h4 ${t('params')}></h4>\n  ${specTable(operation.params)}`}
  ${codeBlock('sample.request', specSample(operation), 'bash')}
</section>`;
}

/** Parameters the API accepts on a hand-written endpoint that its table does not list yet. */
function extraParams(endpoint: Endpoint): string {
  const listed = new Set(endpoint.params.map((row) => row.name));
  const extra = SPEC.find((operation) => operation.path === endpoint.path)?.params.filter((row) => !listed.has(row.name)) ?? [];
  return extra.length === 0 ? '' : `<h4 ${t('params.more')}></h4>\n  ${specTable(extra)}`;
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
      ...SPEC_ENDPOINTS.map((operation) => ({ id: operation.id, code: operation.path.replace('/api/v1', '') })),
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
  resetCodeCounter();
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
  <p class="note" ${t('spec.note')}></p>
  ${SPEC_ENDPOINTS.map(specSection).join('\n')}
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
