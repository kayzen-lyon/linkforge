/**
 * Build-time markup of the request console. Two modes share it:
 *  - `lite`, on the landing page: one address field, the five core endpoints;
 *  - `full`, on /playground: forms generated from the OpenAPI document,
 *    share links, history and batch processing.
 * Text is carried by `data-i18n` keys, filled in at build time.
 */
import type { consoleText } from '../i18n/fr/console.ts';
import { PAGES } from '../site/config.ts';
import { icon, type IconName } from '../site/icons.ts';
import { CODE_LABELS, CODE_LANGS } from './codegen.ts';

type Key = keyof typeof consoleText;
const t = (key: Key): string => `data-i18n="${key}"`;
const label = (key: Key): string => `data-i18n-attr="aria-label:${key}"`;

/** Default address of the demo. Nothing is requested until the visitor presses Run. */
export const DEFAULT_URL = 'https://github.com/kayzen-lyon/linkforge';

/** Ready-made addresses, one per kind of page. Public pages chosen for being stable. */
export const EXAMPLES: ReadonlyArray<readonly [Key, string]> = [
  ['ex.article', 'https://fr.wikipedia.org/wiki/Lyon'],
  ['ex.shop', 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html'],
  ['ex.video', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'],
  ['ex.docs', 'https://developer.mozilla.org/fr/docs/Web/HTML'],
  ['ex.app', DEFAULT_URL],
];

const CORE = ['meta', 'screenshot', 'pdf', 'extract', 'content'] as const;

const tool = (id: string, key: Key, name: IconName, extra = ''): string =>
  `<button type="button" id="${id}" class="tool-btn"${extra} ${label(key)}>${icon(name, 'size-4')}</button>`;

export function consoleMarkup(mode: 'lite' | 'full'): string {
  const full = mode === 'full';
  const view = (name: string, key: Key, selected: boolean): string =>
    `<button type="button" class="tab" role="tab" id="c-tab-${name}" aria-controls="c-view-${name}" aria-selected="${selected}"${selected ? '' : ' tabindex="-1"'} data-view="${name}" ${t(key)}></button>`;

  const endpoints = full
    ? `<label class="field-row"><span class="control-label" ${t('c.endpoint')}></span>
          <select id="c-endpoint" class="field mono"></select>
        </label>`
    : `<div class="tabs" role="tablist" id="c-endpoints" ${label('c.endpoint')}>
          ${CORE.map((name, at) => `<button type="button" class="tab mono" role="tab" id="c-op-${name}" aria-controls="c-response" aria-selected="${at === 0}"${at === 0 ? '' : ' tabindex="-1"'} data-op="GET /api/v1/${name}">/${name}</button>`).join('\n          ')}
        </div>`;

  const extras = full
    ? `<div id="c-spec-status" class="status" role="status" data-state="loading"><span ${t('c.specLoading')}></span></div>
        <div id="c-form" class="param-form" hidden></div>
        <p id="c-spec-note" class="text-xs text-muted-foreground" hidden ${t('c.specNote')}></p>
        <label class="field-row"><span class="control-label" ${t('c.apiKey')}></span>
          <input id="c-key" class="field" type="password" autocomplete="off" spellcheck="false" aria-describedby="c-key-hint" />
          <span id="c-key-hint" class="text-xs text-muted-foreground" ${t('c.apiKey.hint')}></span>
        </label>`
    : '';

  const request = `<section class="console-pane glass-premium" aria-labelledby="c-request-title">
        <h3 id="c-request-title" class="pane-title" ${t('c.request')}></h3>
        ${endpoints}
        <form id="c-form-url" class="flex flex-col gap-3" novalidate>
          <div class="field-row">
            <label for="c-url" class="control-label" ${t('c.url')}></label>
            <div class="flex gap-2">
              <input id="c-url" name="url" class="field" type="url" inputmode="url" autocomplete="off" spellcheck="false" autocapitalize="off" value="${DEFAULT_URL}" aria-describedby="c-url-error" />
              <button type="button" id="c-paste" class="btn btn-secondary btn-compact btn-square" ${label('c.paste')}>${icon('clipboard', 'size-4')}</button>
            </div>
            <p id="c-url-error" class="field-error" role="alert" hidden></p>
          </div>
          <div class="flex flex-wrap items-center gap-2" role="group" aria-labelledby="c-examples-label">
            <span id="c-examples-label" class="text-xs font-semibold text-muted-foreground" ${t('c.examples')}></span>
            ${EXAMPLES.map(([key, url]) => `<button type="button" class="chip chip-btn" data-example="${url}" ${t(key)}></button>`).join('\n            ')}
          </div>
          ${extras}
          <div class="flex flex-wrap gap-2">
            <button id="c-run" type="submit" class="btn btn-primary btn-compact min-h-12!">${icon('play', 'size-4')}<span ${t('c.run')}></span></button>
            <button id="c-cancel" type="button" class="btn btn-secondary btn-compact min-h-12!" hidden>${icon('stop', 'size-4')}<span ${t('c.cancel')}></span></button>
            ${full ? '' : `<a id="c-more" class="text-link ml-auto" href="${PAGES.playground}"><span class="link-grow" ${t('c.more')}></span>${icon('arrowRight', 'size-4')}</a>`}
          </div>
        </form>
        ${full ? history() : ''}
      </section>`;

  const response = `<section id="c-response" class="console-pane console-result glass-premium" aria-labelledby="c-response-title">
        <h3 id="c-response-title" class="sr-only" ${t('c.response')}></h3>
        <div class="request-line">
          <span class="verb" id="c-method">GET</span>
          <code id="c-request-url" tabindex="0" ${label('c.request')}></code>
          <button type="button" class="copy-btn copy-btn-icon" data-copy="#c-request-full" ${label('c.copyUrl')}>${icon('copy', 'size-4')}</button>
          ${full ? `<button type="button" id="c-share" class="copy-btn copy-btn-icon" ${label('c.share')}>${icon('share', 'size-4')}</button>` : ''}
          <span id="c-request-full" hidden></span>
        </div>
        <dl id="c-facts" class="facts-bar"></dl>
        <div class="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <div class="tabs" role="tablist" id="c-views" ${label('v.label')}>
            ${view('output', 'v.output', true)}
            ${view('data', 'v.data', false)}
            ${view('headers', 'v.headers', false)}
            ${view('timing', 'v.timing', false)}
            ${view('code', 'v.code', false)}
          </div>
          <div class="flex items-center gap-1">
            <div id="c-downloads" class="flex items-center gap-1"></div>
            ${tool('c-fullscreen', 'c.fullscreen', 'expand')}
          </div>
        </div>
        <div id="c-live" class="sr-only" role="status" aria-live="polite"></div>
        <div id="c-view-output" class="console-view" role="tabpanel" aria-labelledby="c-tab-output" tabindex="0">
          <div id="c-status" class="empty-state" data-state="idle"></div>
          <div id="c-output" hidden></div>
        </div>
        <div id="c-view-data" class="console-view" role="tabpanel" aria-labelledby="c-tab-data" tabindex="0" hidden>
          <div class="flex flex-wrap items-center gap-2">
            <input id="c-json-search" class="field field-sm" type="search" autocomplete="off" spellcheck="false" data-i18n-attr="aria-label:j.search;placeholder:j.search" />
            <button type="button" id="c-json-expand" class="btn btn-secondary btn-compact" ${t('j.expand')}></button>
            <button type="button" id="c-json-collapse" class="btn btn-secondary btn-compact" ${t('j.collapse')}></button>
            <span id="c-json-count" class="text-xs text-muted-foreground" role="status"></span>
          </div>
          <div id="c-json" class="json-box" tabindex="0"></div>
        </div>
        <div id="c-view-headers" class="console-view" role="tabpanel" aria-labelledby="c-tab-headers" tabindex="0" hidden>
          <div id="c-headers"></div>
        </div>
        <div id="c-view-timing" class="console-view" role="tabpanel" aria-labelledby="c-tab-timing" tabindex="0" hidden>
          <div id="c-timing"></div>
        </div>
        <div id="c-view-code" class="console-view" role="tabpanel" aria-labelledby="c-tab-code" tabindex="0" hidden>
          <figure class="code">
            <figcaption class="code-head code-head-tabs">
              <div class="code-tabs" role="tablist" id="c-code-langs" ${label('k.language')}>
                ${CODE_LANGS.map((id, at) => `<button type="button" class="code-tab" role="tab" id="c-code-${id}" aria-controls="c-code-panel" aria-selected="${at === 0}"${at === 0 ? '' : ' tabindex="-1"'} data-code="${id}">${CODE_LABELS[id]}</button>`).join('')}
              </div>
              <button type="button" class="copy-btn" data-copy="#c-code">${icon('copy', 'size-3.5')}<span data-copy-label data-i18n="copy"></span></button>
            </figcaption>
            <pre id="c-code-panel" role="tabpanel" aria-labelledby="c-code-curl" tabindex="0"><code id="c-code"></code></pre>
          </figure>
        </div>
      </section>`;

  const modes = full
    ? `<div class="mb-6 flex flex-wrap items-center gap-3">
        <div class="tabs" role="tablist" id="c-modes" ${label('mo.label')}>
          <button type="button" class="tab" role="tab" id="c-mode-single" aria-controls="c-single" aria-selected="true" data-mode="single" ${t('mo.single')}></button>
          <button type="button" class="tab" role="tab" id="c-mode-batch" aria-controls="c-batch" aria-selected="false" tabindex="-1" data-mode="batch" ${t('mo.batch')}></button>
        </div>
        <p id="c-api-version" class="badge" hidden></p>
      </div>`
    : '';

  return `<div class="console" id="console" data-mode="${mode}">
      ${modes}
      <div id="c-single" class="console-grid"${full ? ' role="tabpanel" aria-labelledby="c-mode-single"' : ''}>
        ${request}
        ${response}
      </div>
      ${full ? batch() : ''}
    </div>`;
}

function history(): string {
  return `<div class="history">
          <div class="flex items-center justify-between gap-2">
            <h4 class="pane-title" ${t('hi.title')}></h4>
            <button type="button" id="c-history-clear" class="tool-btn" ${label('hi.clear')} hidden>${icon('trash', 'size-4')}</button>
          </div>
          <label class="check"><input type="checkbox" id="c-history-on" aria-describedby="c-history-hint" /><span ${t('hi.enable')}></span></label>
          <p id="c-history-hint" class="text-xs text-muted-foreground" ${t('hi.hint')}></p>
          <ul id="c-history" class="history-list"></ul>
        </div>`;
}

function batch(): string {
  return `<div id="c-batch" class="console-pane glass-premium" role="tabpanel" aria-labelledby="c-mode-batch" hidden>
        <form id="c-batch-form" class="flex flex-col gap-3" novalidate>
          <label for="c-batch-urls" class="control-label" ${t('b.label')}></label>
          <textarea id="c-batch-urls" class="field" spellcheck="false" autocomplete="off" aria-describedby="c-batch-limit c-batch-error"></textarea>
          <p id="c-batch-limit" class="text-xs text-muted-foreground"></p>
          <p id="c-batch-error" class="field-error" role="alert" hidden></p>
          <div class="flex flex-wrap gap-2">
            <button type="submit" id="c-batch-run" class="btn btn-primary btn-compact min-h-12!">${icon('play', 'size-4')}<span ${t('b.run')}></span></button>
            <button type="button" id="c-batch-csv" class="btn btn-secondary btn-compact min-h-12!" hidden>${icon('download', 'size-4')}<span ${t('d.csv')}></span></button>
          </div>
        </form>
        <div id="c-batch-status" class="sr-only" role="status" aria-live="polite"></div>
        <div id="c-batch-result" class="mt-5" hidden></div>
      </div>`;
}
