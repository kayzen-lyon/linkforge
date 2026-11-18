/**
 * Landing page: the live demo (one URL field driving five endpoint tabs) and
 * the code examples that mirror it.
 *
 * Everything coming back from the API describes an arbitrary third-party page,
 * so it is untrusted: it only ever reaches the DOM through `textContent`, text
 * nodes, or attributes that were validated first (`safeHttpUrl`). Nothing in
 * this file parses HTML.
 */
import './style.css';

import * as en from './i18n/en';
import * as fr from './i18n/fr';
import { createI18n } from './i18n/runtime';
import { byId, h, renderCode, safeHttpUrl } from './lib/dom';
import { renderMarkdown } from './lib/markdown';
import { buildSnippet, type EndpointName, type SnippetLang } from './lib/snippets';
import { initTablist, markSelected } from './lib/tablist';
import { initShared } from './site/shared';

type Key = keyof typeof fr.common | keyof typeof fr.home;

const i18n = createI18n<Key>({
  fr: { ...fr.common, ...fr.home },
  en: { ...en.common, ...en.home },
});
initShared(i18n);

// ---- API types --------------------------------------------------------------

interface ResponseMeta {
  readonly cached?: unknown;
  readonly source?: unknown;
  readonly durationMs?: unknown;
}

interface Success {
  readonly status: 'success';
  readonly data: Readonly<Record<string, unknown>>;
  readonly meta?: ResponseMeta;
}

/** Why a demo request failed, kept as data so it can be re-rendered in another language. */
type Failure =
  | { readonly kind: 'api'; readonly code: string; readonly message: string }
  | { readonly kind: 'network' }
  | { readonly kind: 'unexpected'; readonly status: number };

class RequestError extends Error {
  constructor(readonly failure: Failure) {
    super(failure.kind);
  }
}

type View =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly failure: Failure }
  | { readonly state: 'done'; readonly body: Success }
  | { readonly state: 'image'; readonly objectUrl: string; readonly path: string; readonly host: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** Reads an error body, whatever the endpoint was supposed to return. */
async function toFailure(response: Response): Promise<Failure> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body['code'] === 'string') {
      return { kind: 'api', code: body['code'], message: text(body['message']) ?? '' };
    }
  } catch {
    // Not JSON: a proxy or gateway answered instead of the API.
  }
  return { kind: 'unexpected', status: response.status };
}

async function request(path: string, signal: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, { signal, headers: { accept: 'application/json, image/*' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RequestError({ kind: 'network' });
  }
  if (!response.ok) throw new RequestError(await toFailure(response));
  return response;
}

async function requestJson(path: string, signal: AbortSignal): Promise<Success> {
  const response = await request(path, signal);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RequestError({ kind: 'unexpected', status: response.status });
  }
  if (!isRecord(body) || body['status'] !== 'success' || !isRecord(body['data'])) {
    throw new RequestError({ kind: 'unexpected', status: response.status });
  }
  return body as unknown as Success;
}

// ---- Elements and state -----------------------------------------------------

const TABS = ['meta', 'screenshot', 'pdf', 'extract', 'content'] as const satisfies readonly EndpointName[];
const isTab = (value: unknown): value is EndpointName => (TABS as readonly unknown[]).includes(value);

const DEFAULT_RULES = {
  title: { selector: 'h1', attr: 'text' },
  links: { selector: 'a', attr: 'href', type: 'url', all: true },
};

const form = byId<HTMLFormElement>('demo-form');
const urlInput = byId<HTMLInputElement>('demo-url');
const urlError = byId('demo-url-error');
const runButton = byId<HTMLButtonElement>('demo-run');
const tablist = form.parentElement?.querySelector<HTMLElement>('.tabs') ?? byId('demo-form');
const requestCode = byId('demo-request');
const rulesInput = byId<HTMLTextAreaElement>('extract-rules');
const rulesError = byId('extract-error');
const exampleEndpoint = byId<HTMLSelectElement>('example-endpoint');
const exampleTabs = byId('example-tab-curl').parentElement ?? byId('example-tab-curl');
const exampleCode = byId('example-code');

const checked = (id: string): boolean => byId<HTMLInputElement>(id).checked;

let activeTab: EndpointName = 'meta';
let exampleLang: SnippetLang = 'curl';
/** True once a request was started: from then on, changing tab or option re-runs it. */
let started = false;
const views: Record<EndpointName, View> = {
  meta: { state: 'idle' },
  screenshot: { state: 'idle' },
  pdf: { state: 'idle' },
  extract: { state: 'idle' },
  content: { state: 'idle' },
};
const lastPath: Partial<Record<EndpointName, string>> = {};
const controllers: Partial<Record<EndpointName, AbortController>> = {};

rulesInput.value = JSON.stringify(DEFAULT_RULES, null, 2);

// ---- Request building -------------------------------------------------------

function parseRules(): { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false; readonly detail: string } {
  try {
    const value: unknown = JSON.parse(rulesInput.value);
    if (!isRecord(value)) return { ok: false, detail: '' };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : '' };
  }
}

/** Query parameters of a tab, without `fields`. Defaults are left out. */
function baseParams(tab: EndpointName): Array<readonly [string, string]> {
  const params: Array<readonly [string, string]> = [['url', urlInput.value.trim()]];
  if (tab === 'screenshot') {
    if (checked('shot-mobile')) params.push(['device', 'mobile']);
    if (checked('shot-full')) params.push(['fullPage', 'true']);
    if (checked('shot-dark')) params.push(['colorScheme', 'dark']);
  } else if (tab === 'pdf') {
    const format = byId<HTMLSelectElement>('pdf-format').value;
    if (format !== 'A4') params.push(['format', format]);
    if (checked('pdf-landscape')) params.push(['landscape', 'true']);
    if (!checked('pdf-background')) params.push(['printBackground', 'false']);
  }
  return params;
}

function requestPath(tab: EndpointName): string {
  const query = new URLSearchParams(baseParams(tab).map(([name, value]) => [name, value]));
  if (tab === 'extract') {
    const rules = parseRules();
    query.set('fields', rules.ok ? JSON.stringify(rules.value) : rulesInput.value);
  }
  return `/api/v1/${tab}?${query.toString()}`;
}

// ---- Rendering --------------------------------------------------------------

function badges(target: HTMLElement, meta: ResponseMeta | undefined, extra: string[] = []): void {
  const labels = [...extra];
  if (meta?.source === 'http' || meta?.source === 'browser') {
    labels.push(i18n.t(meta.source === 'http' ? 'demo.badge.http' : 'demo.badge.browser'));
  }
  if (meta?.cached === true) labels.push(i18n.t('demo.badge.cached'));
  else if (typeof meta?.durationMs === 'number') labels.push(i18n.t('demo.badge.duration', { ms: meta.durationMs }));
  target.replaceChildren(...labels.map((label) => h('span', { class: 'badge' }, label)));
}

function renderStatus(tab: EndpointName): void {
  if (tab === 'pdf') return;
  const box = byId(`status-${tab}`);
  const result = byId(`result-${tab}`);
  const view = views[tab];
  const settled = view.state === 'done' || view.state === 'image';

  box.hidden = settled;
  result.hidden = !settled;
  box.dataset['state'] = view.state;

  if (view.state === 'idle') {
    box.replaceChildren(i18n.t('demo.idle'));
  } else if (view.state === 'loading') {
    box.replaceChildren(i18n.t(`demo.loading.${tab}`));
  } else if (view.state === 'error') {
    const { failure } = view;
    const title = h('p', { class: 'status-title' }, i18n.t('demo.error.title'));
    if (failure.kind === 'api') {
      const known = `err.${failure.code}`;
      const line = h('p', {}, h('span', { class: 'status-code' }, failure.code), ' ');
      if (known in fr.common) {
        const meaning = h('span', { class: 'hint' });
        i18n.render(meaning, known as Key);
        line.append(meaning);
      }
      const detail =
        failure.message === ''
          ? null
          : h('p', { class: 'status-detail' }, `${i18n.t('demo.error.apiMessage')} ${failure.message}`);
      box.replaceChildren(title, line, detail ?? '');
    } else if (failure.kind === 'network') {
      box.replaceChildren(title, h('p', {}, i18n.t('demo.error.network')));
    } else {
      box.replaceChildren(title, h('p', {}, i18n.t('demo.error.unexpected', { status: failure.status })));
    }
  }
}

/** Shows a remote image, hiding the element when the URL is absent, unsafe or broken. */
function setImage(image: HTMLImageElement, source: unknown): void {
  const url = safeHttpUrl(source);
  image.hidden = url === null;
  image.onerror = () => {
    image.hidden = true;
  };
  image.referrerPolicy = 'no-referrer';
  if (url === null) image.removeAttribute('src');
  else image.src = url;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(i18n.lang(), { dateStyle: 'long' }).format(date);
}

function renderMeta(body: Success): void {
  const { data } = body;
  const card = byId<HTMLAnchorElement>('meta-card');
  const pageUrl = safeHttpUrl(data['url']);
  if (pageUrl === null) card.removeAttribute('href');
  else card.href = pageUrl;

  byId('meta-host').textContent = pageUrl === null ? '' : new URL(pageUrl).host;
  byId('meta-title').textContent = text(data['title']) ?? i18n.t('demo.meta.untitled');
  byId('meta-description').textContent = text(data['description']) ?? '';
  setImage(byId<HTMLImageElement>('meta-image'), isRecord(data['image']) ? data['image']['url'] : null);
  setImage(byId<HTMLImageElement>('meta-favicon'), data['favicon']);

  const date = text(data['date']);
  const facts: Array<readonly [Key, string | null]> = [
    ['demo.meta.author', text(data['author'])],
    ['demo.meta.publisher', text(data['publisher'])],
    ['demo.meta.date', date === null ? null : formatDate(date)],
    ['demo.meta.lang', text(data['lang'])],
  ];
  byId('meta-facts').replaceChildren(
    ...facts.flatMap(([key, value]) => (value === null ? [] : [h('dt', {}, i18n.t(key)), h('dd', {}, value)])),
  );

  badges(byId('meta-badges'), body.meta);
  renderCode(byId('meta-json'), JSON.stringify(body, null, 2), 'json');
}

function renderExtract(body: Success): void {
  badges(byId('extract-badges'), body.meta);
  renderCode(byId('extract-json'), JSON.stringify(body.data['fields'] ?? body.data, null, 2), 'json');
}

function renderContent(body: Success): void {
  const { data } = body;
  const markdown = text(data['markdown']);
  const plain = text(data['text']);
  const mode = checked('content-view-markdown') ? 'markdown' : checked('content-view-text') ? 'text' : 'rendered';

  const title = byId('content-title');
  title.textContent = text(data['title']) ?? '';
  title.hidden = title.textContent === '';

  const stats =
    typeof data['wordCount'] === 'number' && typeof data['readingTimeMinutes'] === 'number'
      ? [i18n.t('demo.content.stats', { words: data['wordCount'], minutes: data['readingTimeMinutes'] })]
      : [];
  badges(byId('content-badges'), body.meta, stats);

  const rendered = byId('content-rendered');
  const raw = byId('content-raw');
  rendered.hidden = mode !== 'rendered';
  raw.hidden = mode === 'rendered';

  if (markdown === null && plain === null) {
    rendered.hidden = false;
    raw.hidden = true;
    rendered.replaceChildren(h('p', {}, i18n.t('demo.content.empty')));
  } else if (mode === 'rendered') {
    renderMarkdown(rendered, markdown ?? plain ?? '');
  } else {
    byId('content-raw-code').textContent = (mode === 'markdown' ? markdown : plain) ?? '';
  }
}

function renderScreenshot(view: Extract<View, { state: 'image' }>): void {
  const image = byId<HTMLImageElement>('shot-image');
  image.src = view.objectUrl;
  image.alt = i18n.t('demo.shot.alt', { host: view.host });
  byId('shot-frame').dataset['device'] = view.path.includes('device=mobile') ? 'mobile' : 'desktop';
  byId<HTMLAnchorElement>('shot-open').href = view.path;
}

function renderResult(tab: EndpointName): void {
  const view = views[tab];
  if (view.state === 'image') renderScreenshot(view);
  if (view.state !== 'done') return;
  if (tab === 'meta') renderMeta(view.body);
  else if (tab === 'extract') renderExtract(view.body);
  else if (tab === 'content') renderContent(view.body);
}

function setView(tab: EndpointName, view: View): void {
  const previous = views[tab];
  if (previous.state === 'image' && (view.state !== 'image' || view.objectUrl !== previous.objectUrl)) {
    URL.revokeObjectURL(previous.objectUrl);
  }
  views[tab] = view;
  renderStatus(tab);
  renderResult(tab);
  if (tab === activeTab) runButton.disabled = view.state === 'loading';
}

/** Request line, PDF links and code example: everything derived from the inputs. */
function renderDerived(): void {
  const path = requestPath(activeTab);
  requestCode.textContent = path;

  const valid = safeHttpUrl(urlInput.value.trim()) !== null;
  const pdfPath = requestPath('pdf');
  for (const id of ['pdf-open', 'pdf-download']) {
    const link = byId<HTMLAnchorElement>(id);
    if (valid) link.href = pdfPath;
    else link.removeAttribute('href');
    link.setAttribute('aria-disabled', String(!valid));
  }

  const rules = parseRules();
  const snippet = buildSnippet(exampleLang, {
    origin: location.origin,
    endpoint: activeTab,
    params: baseParams(activeTab),
    ...(activeTab === 'extract' ? { fields: rules.ok ? rules.value : {} } : {}),
  });
  renderCode(exampleCode, snippet, exampleLang === 'curl' ? 'bash' : exampleLang);
}

// ---- Running requests -------------------------------------------------------

function validateUrl(): boolean {
  const valid = safeHttpUrl(urlInput.value.trim()) !== null;
  urlError.hidden = valid;
  urlError.textContent = valid ? '' : i18n.t('demo.error.invalidUrl');
  urlInput.setAttribute('aria-invalid', String(!valid));
  return valid;
}

function validateRules(): boolean {
  const rules = parseRules();
  rulesError.hidden = rules.ok;
  rulesError.textContent = rules.ok ? '' : i18n.t('demo.extract.invalid', { detail: rules.detail });
  rulesInput.setAttribute('aria-invalid', String(!rules.ok));
  return rules.ok;
}

/**
 * Calls the endpoint behind `tab`.
 * @param quiet - On failure, fall back to the idle state instead of an error
 *   (used for the request made on page load, which nobody asked for).
 */
async function run(tab: EndpointName, quiet = false): Promise<void> {
  if (tab === 'pdf') return; // Generated when the visitor opens the link.
  if (tab === 'extract' && !validateRules()) return;

  const path = requestPath(tab);
  lastPath[tab] = path;
  controllers[tab]?.abort();
  const controller = new AbortController();
  controllers[tab] = controller;
  setView(tab, { state: 'loading' });

  try {
    if (tab === 'screenshot') {
      const response = await request(path, controller.signal);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new RequestError({ kind: 'unexpected', status: response.status });
      const host = new URL(urlInput.value.trim()).host;
      setView(tab, { state: 'image', objectUrl: URL.createObjectURL(blob), path, host });
    } else {
      setView(tab, { state: 'done', body: await requestJson(path, controller.signal) });
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    if (quiet) {
      delete lastPath[tab];
      setView(tab, { state: 'idle' });
      return;
    }
    const failure: Failure = error instanceof RequestError ? error.failure : { kind: 'network' };
    setView(tab, { state: 'error', failure });
  }
}

/** Runs the tab if its inputs changed since its last request. */
function refresh(tab: EndpointName): void {
  if (!started || !validateUrl()) return;
  if (lastPath[tab] !== requestPath(tab)) void run(tab);
}

function selectTab(tab: EndpointName, autoRun = true): void {
  activeTab = tab;
  markSelected(tablist, byId(`tab-${tab}`));
  for (const name of TABS) byId(`panel-${name}`).hidden = name !== tab;
  exampleEndpoint.value = tab;
  runButton.disabled = views[tab].state === 'loading';
  renderDerived();
  // Extraction rules are the visitor's own: run them only when asked to.
  if (autoRun && tab !== 'extract') refresh(tab);
}

// ---- Events -----------------------------------------------------------------

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateUrl()) {
    urlInput.focus();
    return;
  }
  started = true;
  renderDerived();
  void run(activeTab);
});

urlInput.addEventListener('input', () => {
  if (urlInput.getAttribute('aria-invalid') === 'true') validateUrl();
  renderDerived();
});

initTablist(tablist, (tab) => {
  const name = tab.dataset['tab'];
  if (isTab(name)) selectTab(name);
});

for (const id of ['shot-desktop', 'shot-mobile', 'shot-full', 'shot-dark']) {
  byId(id).addEventListener('change', () => {
    renderDerived();
    refresh('screenshot');
  });
}
for (const id of ['pdf-format', 'pdf-landscape', 'pdf-background']) {
  byId(id).addEventListener('change', renderDerived);
}
for (const id of ['pdf-open', 'pdf-download']) {
  byId(id).addEventListener('click', (event) => {
    if (!validateUrl()) event.preventDefault();
  });
}
rulesInput.addEventListener('input', () => {
  if (rulesInput.getAttribute('aria-invalid') === 'true') validateRules();
  renderDerived();
});
for (const id of ['content-view-rendered', 'content-view-markdown', 'content-view-text']) {
  byId(id).addEventListener('change', () => renderResult('content'));
}

// Hero: each endpoint row opens its tab in the demo.
for (const row of document.querySelectorAll<HTMLElement>('[data-goto]')) {
  row.addEventListener('click', () => {
    const name = row.dataset['goto'];
    if (!isTab(name)) return;
    selectTab(name);
    byId('demo').scrollIntoView();
    byId(`tab-${name}`).focus({ preventScroll: true });
  });
}

exampleEndpoint.addEventListener('change', () => {
  if (isTab(exampleEndpoint.value)) selectTab(exampleEndpoint.value, false);
});
initTablist(exampleTabs, (tab) => {
  const lang = tab.dataset['example'];
  if (lang !== 'curl' && lang !== 'js' && lang !== 'python') return;
  exampleLang = lang;
  markSelected(exampleTabs, tab);
  byId('example-panel').setAttribute('aria-labelledby', tab.id);
  renderDerived();
});

i18n.onChange(() => {
  for (const tab of TABS) {
    renderStatus(tab);
    renderResult(tab);
  }
  if (!urlError.hidden) validateUrl();
  if (!rulesError.hidden) validateRules();
});

// ---- First paint ------------------------------------------------------------

for (const tab of TABS) renderStatus(tab);
selectTab('meta', false);

// Show a real response straight away. If the request fails (API asleep, target
// unreachable), stay on the idle state rather than greeting visitors with an error.
started = true;
void run('meta', true);
