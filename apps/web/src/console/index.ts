/**
 * The request console: the landing-page demo (`lite`) and the playground (`full`).
 *
 * Nothing is requested before the visitor presses "Run" — a request makes the
 * API read a third-party page, and a link preview makes the browser load that
 * page's images. Every figure shown (duration, render source, cache state,
 * request id, quota) is read from the response the visitor just received.
 */
import type { consoleText } from '../i18n/fr/console';
import type { I18n } from '../i18n/runtime';
import { byId, copyText, h, renderCode, safeHttpUrl } from '../lib/dom';
import { initTablist, markSelected } from '../lib/tablist';
import { PAGES, STORAGE, localizeHref } from '../site/config';
import { iconNode, type IconName } from '../site/icons';
import { fromKeyboard, toast } from '../site/shared';
import { CODE_SYNTAX, generateCode, type CodeLangId } from './codegen';
import { filterJson, renderJson, setAllOpen } from './jsonview';
import { CORE_OPERATIONS, loadSpec, shortName, type ApiSpec, type Operation, type ParamDef } from './spec';
import {
  autoView,
  batchView,
  checkView,
  compareControl,
  insightsView,
  oembedView,
  paletteView,
  pictureView,
  sliderView,
  tablesView,
  contentView,
  fieldsView,
  headersView,
  imageView,
  isRecord,
  metaView,
  pdfView,
  text,
  timingView,
  toCsv,
  type BatchRow,
  type Shot,
  type Timing,
} from './views';

type Key = keyof typeof consoleText;
type Mode = 'lite' | 'full';

type Failure =
  | { readonly kind: 'api'; readonly code: string; readonly message: string }
  | { readonly kind: 'network' }
  | { readonly kind: 'unexpected'; readonly status: number };

interface Outcome {
  readonly operation: Operation;
  readonly path: string;
  readonly status: number;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly kind: 'json' | 'image' | 'pdf' | 'text' | 'redirect';
  readonly json?: unknown;
  readonly body?: string;
  readonly blob?: Blob;
  readonly objectUrl?: string;
  readonly bytes: number;
  readonly timing: Timing;
  readonly failure?: Failure;
  /** Second capture of a comparison. */
  readonly extra?: readonly Shot[];
}

interface Built {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly query: Array<readonly [string, string]>;
  readonly body?: Record<string, unknown>;
}

interface HistoryEntry {
  readonly id: string;
  readonly values: Readonly<Record<string, string>>;
  readonly status: number;
  readonly at: number;
}

const DEFAULT_RULES = { title: { selector: 'h1' }, links: { selector: 'a', attr: 'href', type: 'url', all: true } };
const TEMPLATES: Readonly<Record<string, unknown>> = {
  article: { title: { selector: 'h1' }, author: { selector: '[rel="author"], .author' }, published: { selector: 'time', attr: 'datetime' }, paragraphs: { selector: 'article p', all: true } },
  product: { name: { selector: 'h1' }, price: { selector: '.price, [itemprop="price"]', type: 'number' }, image: { selector: 'img', attr: 'src', type: 'url' } },
  links: { links: { selector: 'a', attr: 'href', type: 'url', all: true } },
  headings: { h1: { selector: 'h1' }, h2: { selector: 'h2', all: true }, h3: { selector: 'h3', all: true } },
};

const formatBytes = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(1)} kB` : `${(bytes / 1_048_576).toFixed(2)} MB`);

export function initConsole(i18n: I18n<Key>): void {
  const rootElement = document.getElementById('console');
  if (rootElement === null) return;
  const mode: Mode = rootElement.dataset['mode'] === 'full' ? 'full' : 'lite';
  const full = mode === 'full';
  const t = i18n.t;

  const urlInput = byId<HTMLInputElement>('c-url');
  const urlError = byId('c-url-error');
  const runButton = byId<HTMLButtonElement>('c-run');
  const cancelButton = byId<HTMLButtonElement>('c-cancel');
  const statusBox = byId('c-status');
  const output = byId('c-output');
  const facts = byId('c-facts');
  const live = byId('c-live');
  const views = byId('c-views');
  const downloads = byId('c-downloads');
  const codeTabs = byId('c-code-langs');

  let operations: readonly Operation[] = CORE_OPERATIONS;
  let operation: Operation = CORE_OPERATIONS[0] as Operation;
  let spec: ApiSpec | null = null;
  /** Form values, shared across endpoints (so `url` and common options carry over). */
  const values: Record<string, string> = { fields: JSON.stringify(DEFAULT_RULES, null, 2) };
  let outcome: Outcome | null = null;
  let controller: AbortController | null = null;
  let codeLang: CodeLangId = 'curl';
  let compare = 'none';
  let apiKey = '';
  let loading = false;

  // ---- Request building ---------------------------------------------------------

  const param = (name: string): ParamDef | undefined => operation.params.find((item) => item.name === name);

  function build(overrides: Readonly<Record<string, string>> = {}): Built {
    const query: Array<readonly [string, string]> = [];
    const body: Record<string, unknown> = {};
    for (const item of operation.params) {
      let value = (overrides[item.name] ?? (item.name === 'url' ? urlInput.value : values[item.name]) ?? '').trim();
      if (item.name === 'fields') {
        try {
          value = JSON.stringify(JSON.parse(value));
        } catch {
          // Sent as typed: the API explains what is wrong with it.
        }
      }
      if (value === '' || (value === item.fallback && !(item.name in overrides))) continue;
      // A preset replaces hand-written rules: sending both would be contradictory.
      if (item.name === 'fields' && (values['preset'] ?? '') !== '') continue;
      if (item.where === 'query') {
        query.push([item.name, value]);
      } else if (item.type === 'array') {
        body[item.name] = value.split(/\s*\n\s*/).filter(Boolean);
      } else if (item.type === 'boolean') {
        body[item.name] = value === 'true';
      } else if (item.type === 'integer' || item.type === 'number') {
        body[item.name] = Number(value);
      } else {
        body[item.name] = value;
      }
    }
    return { method: operation.method, path: operation.path, query, ...(operation.method === 'POST' ? { body } : {}) };
  }

  const pathOf = (built: Built): string => {
    const search = new URLSearchParams(built.query.map(([name, value]) => [name, value])).toString();
    return `${built.path}${search === '' ? '' : `?${search}`}`;
  };

  const binary = (): boolean => operation.produces.length > 0 && operation.produces.every((type) => !/json|text/.test(type));
  const fileName = (): string => {
    const base = shortName(operation).replace(/^\//, '').replace(/\W+/g, '-') || 'response';
    const format = values['format'] ?? '';
    if (operation.produces.some((type) => type.includes('pdf'))) return `${base}.pdf`;
    if (operation.produces.some((type) => type.startsWith('image/'))) return `${base}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    return `${base}.json`;
  };

  /** State of the form as a share link. The API key is never part of it. */
  function shareUrl(): string {
    const built = build();
    const link = new URL(localizeHref(PAGES.playground, i18n.lang()), location.origin);
    link.searchParams.set('r', `${built.method} ${pathOf(built)}`);
    if (built.body !== undefined) link.searchParams.set('b', JSON.stringify(built.body));
    return link.href;
  }

  function renderDerived(): void {
    const built = build();
    const path = pathOf(built);
    byId('c-method').textContent = built.method;
    byId('c-request-url').textContent = path;
    byId('c-request-full').textContent = `${location.origin}${path}`;
    const more = document.getElementById('c-more');
    if (more instanceof HTMLAnchorElement) more.href = shareUrl();
    renderCode(
      byId('c-code'),
      generateCode(codeLang, {
        origin: location.origin,
        method: built.method,
        path: built.path,
        query: built.query,
        ...(built.body === undefined ? {} : { body: built.body }),
        binary: binary(),
        file: fileName(),
        withKey: apiKey !== '',
      }),
      CODE_SYNTAX[codeLang],
    );
  }

  // ---- Form generated from the OpenAPI document (full mode) -------------------------

  /** French text of the specification, loaded only on French pages. */
  let french: typeof import('../docs/spec-fr.ts') | null = null;
  const operationKey = (item: Operation): string => item.path.replace(/^\/api\/v\d+\//, '').replace(/^\//, '').replace(/\//g, '-');
  const summaryOf = (item: Operation): string => (i18n.lang() === 'fr' ? french?.SUMMARIES_FR[operationKey(item)] : undefined) ?? item.summary;
  const optionLabel = (item: Operation): string => `${item.method} ${shortName(item)}${summaryOf(item) === '' ? '' : ` · ${summaryOf(item)}`}`;
  /** Re-labels the endpoint list and the form in the page language. */
  function localizeSpec(): void {
    const apply = (): void => {
      for (const option of document.querySelectorAll<HTMLOptionElement>('#c-endpoint option')) {
        const item = operations.find((candidate) => candidate.id === option.value);
        if (item !== undefined) option.textContent = optionLabel(item);
      }
      renderForm();
    };
    if (i18n.lang() !== 'fr' || french !== null) return apply();
    void import('../docs/spec-fr.ts').then((module) => {
      french = module;
      apply();
    }, apply);
  }

  function field(item: ParamDef): HTMLElement {
    const id = `c-p-${item.name}`;
    const current = values[item.name] ?? '';
    const onInput = (value: string): void => {
      values[item.name] = value;
      renderDerived();
    };
    let control: HTMLElement;

    if (item.name === 'fields') {
      const area = h('textarea', { id, class: 'field', spellcheck: 'false', autocomplete: 'off', 'aria-describedby': `${id}-state` });
      area.value = current;
      const state = h('p', { id: `${id}-state`, class: 'text-xs', role: 'status' });
      const validate = (): void => {
        try {
          const parsed: unknown = JSON.parse(area.value);
          if (!isRecord(parsed)) throw new Error('');
          state.textContent = t('x.valid', { n: Object.keys(parsed).length });
          state.className = 'text-xs text-ok';
          area.setAttribute('aria-invalid', 'false');
        } catch (error) {
          state.textContent = t('x.invalid', { detail: error instanceof Error ? error.message : '' });
          state.className = 'field-error';
          area.setAttribute('aria-invalid', 'true');
        }
      };
      area.addEventListener('input', () => {
        validate();
        onInput(area.value);
      });
      const templates = h('div', { class: 'flex flex-wrap items-center gap-2' }, h('span', { class: 'text-xs font-semibold text-muted-foreground' }, t('x.templates')));
      for (const name of Object.keys(TEMPLATES)) {
        const button = h('button', { type: 'button', class: 'chip chip-btn' }, t(`x.tpl.${name}` as Key));
        button.addEventListener('click', () => {
          area.value = JSON.stringify(TEMPLATES[name], null, 2);
          validate();
          onInput(area.value);
        });
        templates.append(button);
      }
      validate();
      control = h('div', { class: 'flex flex-col gap-2' }, area, state, templates);
    } else if (item.type === 'array') {
      const area = h('textarea', { id, class: 'field field-short', spellcheck: 'false', autocomplete: 'off' });
      area.value = current;
      area.addEventListener('input', () => onInput(area.value));
      control = area;
    } else if (item.options !== undefined || item.type === 'boolean') {
      const select = h('select', { id, class: 'field' });
      const fallback = item.fallback === undefined ? '' : ` (${t('c.default', { value: item.fallback })})`;
      select.append(h('option', { value: '' }, `–${fallback}`));
      for (const option of item.options ?? ['true', 'false']) select.append(h('option', { value: option }, option));
      select.value = current;
      select.addEventListener('change', () => onInput(select.value));
      control = select;
    } else {
      const input = h('input', { id, class: 'field', type: item.type === 'string' ? 'text' : 'number', autocomplete: 'off', spellcheck: 'false' });
      if (item.min !== undefined) input.min = String(item.min);
      if (item.max !== undefined) input.max = String(item.max);
      if (item.fallback !== undefined) input.placeholder = item.fallback;
      input.value = current;
      input.addEventListener('input', () => onInput(input.value));
      control = input;
    }

    const name = h('label', { for: id, class: 'param-label' }, h('code', {}, item.name), item.required ? h('span', { class: 'req' }, t('c.required')) : null);
    // Descriptions come from the OpenAPI document, written in English; French pages use the
    // translation the reference is built from, and fall back to English (marked as such).
    const translated = i18n.lang() === 'fr' ? (french?.PARAMS_FR[`${operationKey(operation)}.${item.name}`] ?? french?.PARAMS_FR[`*.${item.name}`]) : undefined;
    const hint =
      item.description === ''
        ? null
        : h('p', translated === undefined ? { class: 'param-hint', lang: 'en' } : { class: 'param-hint' }, (translated ?? item.description).replace(/`/g, ''));
    return h('div', { class: 'param' }, name, control, hint);
  }

  function renderForm(): void {
    const form = document.getElementById('c-form');
    if (form === null) return;
    const items = operation.params.filter((item) => item.name !== 'url');
    const primary = items.filter((item) => item.required || item.name === 'fields').concat(items.filter((item) => !item.required && item.name !== 'fields').slice(0, 4));
    const rest = items.filter((item) => !primary.includes(item));
    const nodes: Node[] = primary.map(field);
    if (rest.length > 0) {
      const details = h('details', { class: 'param-more' }, h('summary', {}, `${t('c.advanced')} (${rest.length})`), h('div', { class: 'param-form' }, ...rest.map(field)));
      details.open = rest.some((item) => (values[item.name] ?? '') !== '');
      nodes.push(details);
    }
    form.replaceChildren(...nodes);
    form.hidden = nodes.length === 0;
    const urlRow = urlInput.closest<HTMLElement>('.field-row');
    if (urlRow !== null) urlRow.hidden = param('url') === undefined;
  }

  function setOperation(id: string): void {
    const next = operations.find((item) => item.id === id);
    if (next === undefined) return;
    operation = next;
    const select = document.getElementById('c-endpoint');
    if (select instanceof HTMLSelectElement) select.value = id;
    const chips = document.getElementById('c-endpoints');
    if (chips !== null) {
      const chip = chips.querySelector<HTMLElement>(`[data-op="${id}"]`);
      if (chip !== null) markSelected(chips, chip);
    }
    renderForm();
    renderDerived();
  }

  async function initSpec(force = false): Promise<void> {
    const status = document.getElementById('c-spec-status');
    const select = document.getElementById('c-endpoint');
    if (!(select instanceof HTMLSelectElement) || status === null) return;
    status.hidden = false;
    status.dataset['state'] = 'loading';
    status.replaceChildren(h('span', {}, t('c.specLoading')));
    try {
      spec = await loadSpec(force);
    } catch {
      status.dataset['state'] = 'error';
      const retry = h('button', { type: 'button', class: 'btn btn-secondary btn-compact' }, iconNode('refresh', 'size-4'), t('c.retry'));
      retry.addEventListener('click', () => void initSpec(true));
      status.replaceChildren(h('p', {}, t('c.specFailed')), retry);
      return;
    }
    status.hidden = true;
    byId('c-spec-note').hidden = false;
    operations = spec.operations.filter((item) => !/openapi\.json$/.test(item.path));
    const groups = new Map<string, Operation[]>();
    for (const item of operations) groups.set(item.tag, [...(groups.get(item.tag) ?? []), item]);
    select.replaceChildren(
      ...[...groups].map(([tag, items]) => {
        const group = h('optgroup', { label: tag, lang: 'en' });
        for (const item of items) group.append(h('option', { value: item.id }, optionLabel(item)));
        return group;
      }),
    );
    const version = document.getElementById('c-api-version');
    if (version !== null && spec.version !== '') {
      version.textContent = `${spec.title} ${spec.version} · ${operations.length} endpoints`;
      version.setAttribute('lang', 'en');
      version.hidden = false;
    }
    const limit = document.getElementById('c-batch-limit');
    if (limit !== null) limit.textContent = t('b.limit', { max: batchMax() });
    const wanted = restore() ?? operation.id;
    setOperation(operations.some((item) => item.id === wanted) ? wanted : (operations[0]?.id ?? operation.id));
    if (i18n.lang() === 'fr' && french === null) localizeSpec();
  }

  /** Reads a share link (`?r=METHOD /path?query`, `&b=<json body>`) back into the form. */
  function restore(): string | null {
    const search = new URLSearchParams(location.search);
    const request = search.get('r');
    if (request === null) return null;
    const match = /^(GET|POST) (\/[^?\s]*)(?:\?(.*))?$/.exec(request);
    if (match === null) return null;
    for (const [name, value] of new URLSearchParams(match[3] ?? '')) {
      if (name === 'url') urlInput.value = value;
      else if (name === 'fields') {
        try {
          values[name] = JSON.stringify(JSON.parse(value), null, 2);
        } catch {
          values[name] = value;
        }
      } else values[name] = value;
    }
    try {
      const body: unknown = JSON.parse(search.get('b') ?? 'null');
      if (isRecord(body)) for (const [name, value] of Object.entries(body)) values[name] = Array.isArray(value) ? value.join('\n') : String(value);
    } catch {
      // A damaged link simply restores less.
    }
    return `${match[1]} ${match[2]}`;
  }

  // ---- Running ---------------------------------------------------------------------

  async function send(built: Built, signal: AbortSignal): Promise<Outcome> {
    const path = pathOf(built);
    const headers: Record<string, string> = { accept: 'application/json, */*' };
    if (built.body !== undefined) headers['content-type'] = 'application/json';
    if (apiKey !== '') headers['x-api-key'] = apiKey;

    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(path, {
        method: built.method,
        headers,
        signal,
        redirect: 'manual',
        ...(built.body === undefined ? {} : { body: JSON.stringify(built.body) }),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      return { operation, path, status: 0, headers: [], kind: 'text', bytes: 0, timing: { total: performance.now() - started, headers: 0, body: 0, server: null }, failure: { kind: 'network' } };
    }
    const gotHeaders = performance.now();
    const base = { operation, path, status: response.status, headers: [...response.headers.entries()] };
    const done = (bytes: number, server: number | null = null): { bytes: number; timing: Timing } => {
      const end = performance.now();
      return { bytes, timing: { total: end - started, headers: gotHeaders - started, body: end - gotHeaders, server } };
    };

    if (response.type === 'opaqueredirect') return { ...base, kind: 'redirect', ...done(0) };
    const type = response.headers.get('content-type') ?? '';

    if (type.includes('json')) {
      const body = await response.text();
      let json: unknown = null;
      try {
        json = JSON.parse(body);
      } catch {
        return { ...base, kind: 'text', body, ...done(body.length), failure: { kind: 'unexpected', status: response.status } };
      }
      const server = isRecord(json) && isRecord(json['meta']) && typeof json['meta']['durationMs'] === 'number' ? json['meta']['durationMs'] : null;
      const failure: Failure | undefined = response.ok
        ? undefined
        : isRecord(json) && typeof json['code'] === 'string'
          ? { kind: 'api', code: json['code'], message: text(json['message']) ?? '' }
          : { kind: 'unexpected', status: response.status };
      return { ...base, kind: 'json', json, body, ...done(new Blob([body]).size, server), ...(failure === undefined ? {} : { failure }) };
    }
    if (!response.ok) return { ...base, kind: 'text', body: await response.text(), ...done(0), failure: { kind: 'unexpected', status: response.status } };
    if (type.startsWith('image/') || type.includes('pdf')) {
      const blob = await response.blob();
      return { ...base, kind: type.includes('pdf') ? 'pdf' : 'image', blob, objectUrl: URL.createObjectURL(blob), ...done(blob.size) };
    }
    const body = await response.text();
    return { ...base, kind: 'text', body, ...done(new Blob([body]).size) };
  }

  function validate(): boolean {
    let message = '';
    if (param('url') !== undefined && safeHttpUrl(urlInput.value.trim()) === null) message = t('c.error.invalidUrl');
    urlError.hidden = message === '';
    urlError.textContent = message;
    urlInput.setAttribute('aria-invalid', String(message !== ''));
    if (message !== '') {
      urlInput.focus();
      return false;
    }
    const missing = operation.params.find((item) => item.required && item.name !== 'url' && (values[item.name] ?? '').trim() === '');
    if (missing !== undefined) {
      toast(t('c.error.missing', { name: missing.name }).replace(/`/g, ''), 'error');
      document.getElementById(`c-p-${missing.name}`)?.focus();
      return false;
    }
    return true;
  }

  function setLoading(next: boolean): void {
    loading = next;
    runButton.disabled = next;
    cancelButton.hidden = !next;
    rootElement?.setAttribute('aria-busy', String(next));
  }

  function release(previous: Outcome | null): void {
    if (previous?.objectUrl !== undefined) URL.revokeObjectURL(previous.objectUrl);
    for (const shot of previous?.extra ?? []) URL.revokeObjectURL(shot.url);
  }

  async function run(): Promise<void> {
    if (loading || !validate()) return;
    controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    renderStatus('loading');
    try {
      let next = await send(build(), signal);
      // Comparison: the same capture again with the other scheme or the other device.
      if (full && compare !== 'none' && next.kind === 'image' && next.failure === undefined) {
        const [name, first, second]: [string, string, string] = compare === 'scheme' ? ['colorScheme', 'light', 'dark'] : ['device', 'desktop', 'mobile'];
        const [a, b] = await Promise.all([send(build({ [name]: first }), signal), send(build({ [name]: second }), signal)]);
        if (a.objectUrl !== undefined && b.objectUrl !== undefined) {
          const label = (value: string): string => t(`s.${value === 'light' || value === 'dark' ? value : value === 'desktop' ? 'desktop' : 'mobile'}` as Key);
          release(next);
          next = {
            ...a,
            extra: [
              { url: a.objectUrl, mobile: first === 'mobile' || (name !== 'device' && values['device'] === 'mobile'), label: label(first) },
              { url: b.objectUrl, mobile: second === 'mobile' || (name !== 'device' && values['device'] === 'mobile'), label: label(second) },
            ],
          };
        }
      }
      release(outcome);
      outcome = next;
      remember(next);
      renderOutcome();
      live.textContent = next.failure === undefined ? t('a.done', { status: next.status, ms: Math.round(next.timing.total) }) : t('a.failed', { code: next.failure.kind === 'api' ? next.failure.code : String(next.status || '') });
    } catch {
      renderStatus('idle');
      live.textContent = t('c.cancelled');
      toast(t('c.cancelled'));
    } finally {
      setLoading(false);
      controller = null;
    }
  }

  // ---- Rendering --------------------------------------------------------------------

  function emptyState(name: IconName, title: string, body: Node | string, action: Node | null = null): void {
    statusBox.replaceChildren(h('span', { class: 'empty-icon' }, iconNode(name, 'size-6')), h('p', { class: 'empty-title' }, title), typeof body === 'string' ? h('p', { class: 'empty-body' }, body) : body, ...(action === null ? [] : [action]));
  }

  function renderStatus(state: 'idle' | 'loading' | 'error'): void {
    statusBox.hidden = false;
    output.hidden = true;
    statusBox.dataset['state'] = state;
    if (state === 'idle') {
      emptyState('play', t('c.idle.title'), t('c.idle.body'));
      return;
    }
    if (state === 'loading') {
      // A skeleton in the shape of what is coming: an image, or lines of text.
      const image = operation.produces.some((type) => type.startsWith('image/') || type.includes('pdf'));
      statusBox.replaceChildren(
        h('p', { class: 'sr-only' }, t('c.loading')),
        h('div', { class: `skeleton ${image ? 'skeleton-image' : 'skeleton-card'}`, 'aria-hidden': 'true' }, ...(image ? [] : [h('i'), h('i'), h('i'), h('i')])),
      );
      return;
    }
    const failure = outcome?.failure;
    if (failure === undefined) return;
    const retry = h('button', { type: 'button', class: 'btn btn-secondary btn-compact' }, iconNode('refresh', 'size-4'), t('c.retry'));
    retry.addEventListener('click', () => void run());
    if (failure.kind === 'api') {
      const why = `why.${failure.code}`;
      const fix = `fix.${failure.code}`;
      const explain = h('dl', { class: 'error-explain' });
      if (i18n.has(why) && i18n.has(fix)) {
        const cause = h('dd', { class: 'hint' });
        const remedy = h('dd', { class: 'hint' });
        i18n.render(cause, why as Key);
        i18n.render(remedy, fix as Key);
        explain.append(h('dt', {}, t('c.error.why')), cause, h('dt', {}, t('c.error.fix')), remedy);
      }
      const body = h(
        'div',
        { class: 'empty-body' },
        h('p', {}, h('code', { class: 'status-code' }, failure.code), ` · HTTP ${outcome?.status ?? ''}`),
        explain,
        // The API speaks English whatever the page language: say so to assistive tech.
        failure.message === '' ? null : h('p', { class: 'status-detail' }, `${t('c.error.api')} `, h('span', { lang: 'en' }, failure.message)),
      );
      emptyState('alert', t('c.error.title'), body, retry);
    } else {
      emptyState('alert', t('c.error.title'), failure.kind === 'network' ? t('c.error.network') : t('c.error.unexpected', { status: failure.status }), retry);
    }
  }

  function renderFacts(): void {
    const items: Array<readonly [string, string, string?]> = [];
    if (outcome !== null) {
      const header = (name: string): string | null => outcome?.headers.find(([key]) => key === name)?.[1] ?? null;
      const ok = outcome.failure === undefined;
      if (outcome.status > 0) items.push([t('f.status'), String(outcome.status), ok ? 'ok' : 'error']);
      items.push([t('f.duration'), t('f.ms', { ms: Math.round(outcome.timing.total) })]);
      if (outcome.timing.server !== null) items.push([t('f.server'), t('f.ms', { ms: Math.round(outcome.timing.server) })]);
      const source = header('x-render-source');
      if (source === 'http' || source === 'browser') items.push([t('f.source'), t(`f.source.${source}`)]);
      const cache = header('x-cache');
      if (cache === 'HIT' || cache === 'MISS') items.push([t('f.cache'), t(`f.cache.${cache}`)]);
      if (outcome.bytes > 0) items.push([t('f.size'), formatBytes(outcome.bytes)]);
      const remaining = header('x-ratelimit-remaining');
      const limit = header('x-ratelimit-limit');
      if (remaining !== null && limit !== null) items.push([t('f.quota'), t('f.quota.value', { remaining, limit })]);
      const id = header('x-request-id');
      if (id !== null) items.push([t('f.requestId'), id, 'mono']);
    }
    facts.replaceChildren(...items.map(([name, value, tone]) => h('div', { class: `fact${tone === undefined ? '' : ` fact-${tone}`}` }, h('dt', {}, name), h('dd', {}, value))));
    facts.hidden = items.length === 0;
  }

  function download(name: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderDownloads(): void {
    const buttons: HTMLElement[] = [];
    const add = (label: string, name: string, make: () => Blob): void => {
      const button = h('button', { type: 'button', class: 'tool-btn tool-btn-text', 'aria-label': `${t('d.download')} ${label}` }, iconNode('download', 'size-4'), h('span', {}, label));
      button.addEventListener('click', () => download(name, make()));
      buttons.push(button);
    };
    if (outcome !== null && outcome.failure === undefined) {
      const { blob, body, json } = outcome;
      const base = fileName().replace(/\.\w+$/, '');
      if (blob !== undefined) add(blob.type.split('/')[1]?.toUpperCase() ?? t('d.file'), fileName(), () => blob);
      if (json !== undefined) add(t('d.json'), `${base}.json`, () => new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
      const markdown = isRecord(json) && isRecord(json['data']) ? text(json['data']['markdown']) : outcome.kind === 'text' ? (body ?? null) : null;
      if (markdown !== null) add(t('d.markdown'), `${base}.md`, () => new Blob([markdown], { type: 'text/markdown' }));
    }
    downloads.replaceChildren(...buttons);
  }

  function renderOutput(): void {
    if (outcome === null) return renderStatus('idle');
    if (outcome.failure !== undefined) return renderStatus('error');
    statusBox.hidden = true;
    output.hidden = false;
    const { json, kind, objectUrl } = outcome;
    const name = shortName(outcome.operation);
    const data = isRecord(json) ? json['data'] : undefined;

    if (kind === 'redirect') {
      output.replaceChildren(h('p', { class: 'note' }, t('c.redirect')), h('p', {}, h('a', { class: 'btn btn-secondary btn-compact', href: outcome.path, target: '_blank', rel: 'noopener' }, t('c.open'))));
    } else if (kind === 'image' && objectUrl !== undefined) {
      let host = '';
      try {
        host = new URL(urlInput.value.trim()).host;
      } catch {
        host = '';
      }
      const shots = outcome.extra ?? [{ url: objectUrl, mobile: /[?&]device=mobile/.test(outcome.path) }];
      const control = full && /screenshot/.test(name) ? compareControl(i18n, compare, (value) => { compare = value; if (outcome !== null) void run(); }) : null;
      if (!/screenshot/.test(name)) pictureView(output, objectUrl, name.replace('/', ''));
      // Light and dark share their size: one image over the other, under a slider.
      else if (outcome.extra !== undefined && compare === 'scheme') sliderView(output, shots, t('s.alt', { host }), control, t('s.slider'));
      else imageView(output, shots, t('s.alt', { host }), control);
    } else if (kind === 'pdf' && objectUrl !== undefined) {
      pdfView(output, objectUrl, i18n);
    } else if (isRecord(data) && /^\/meta$/.test(name)) {
      metaView(output, data, i18n);
    } else if (isRecord(data) && isRecord(data['fields'])) {
      fieldsView(output, data['fields'], i18n);
    } else if (isRecord(data) && (typeof data['markdown'] === 'string' || /^\/content$/.test(name))) {
      contentView(output, data, i18n, full);
    } else if (Array.isArray(data) && /batch/.test(name)) {
      batchView(output, batchRows(data), i18n);
    } else if (isRecord(data) && /^\/insights$/.test(name)) {
      insightsView(output, data, i18n);
    } else if (isRecord(data) && /^\/check$/.test(name)) {
      checkView(output, data, i18n);
    } else if (isRecord(data) && /^\/palette$/.test(name)) {
      paletteView(output, data, i18n, (hex) => void copyText(hex).then((ok) => toast(ok ? t('pv.copied', { hex }) : hex, ok ? 'info' : 'error')));
    } else if (isRecord(data) && /^\/oembed$/.test(name)) {
      oembedView(output, data, i18n);
    } else if (isRecord(data) && /^\/tables$/.test(name)) {
      tablesView(output, data, i18n, (file, csv) => download(file, new Blob([`\ufeff${csv}`], { type: 'text/csv' })));
    } else if (isRecord(data) && Object.values(data).some((value) => (Array.isArray(value) && value.some(isRecord)) || value === null || typeof value !== 'object')) {
      // Technologies, links, sitemaps, icons, image facts: facts and tables rather than raw JSON.
      autoView(output, data, i18n);
    } else if (json !== undefined) {
      const box = h('div', { class: 'json-box' });
      renderJson(box, json, jsonText(), copyPath);
      output.replaceChildren(full ? h('p', { class: 'text-sm text-muted-foreground' }, t('c.generic')) : '', box);
    } else if (kind === 'text' && /markdown/.test(outcome.headers.find(([key]) => key === 'content-type')?.[1] ?? '')) {
      contentView(output, { markdown: outcome.body ?? '' }, i18n, full);
    } else {
      output.replaceChildren(h('figure', { class: 'code' }, h('pre', { class: 'wrap', tabindex: '0' }, h('code', {}, outcome.body ?? ''))));
    }
  }

  const jsonText = (): { copyPath: (path: string) => string; items: (count: number) => string } => ({
    copyPath: (path) => t('j.copyPath', { path }),
    items: (count) => t('j.items', { n: count }),
  });
  const copyPath = (path: string): void => {
    void copyText(path).then((ok) => toast(ok ? t('j.pathCopied', { path }) : path, ok ? 'info' : 'error'));
  };

  function renderData(): void {
    const box = byId('c-json');
    const search = byId<HTMLInputElement>('c-json-search');
    if (outcome?.json === undefined) {
      box.replaceChildren(h('p', { class: 'text-sm text-muted-foreground' }, outcome === null ? t('c.idle.title') : `${outcome.headers.find(([key]) => key === 'content-type')?.[1] ?? ''} · ${formatBytes(outcome.bytes)}`));
      return;
    }
    renderJson(box, outcome.json, jsonText(), copyPath);
    if (search.value !== '') byId('c-json-count').textContent = t('j.matches', { n: filterJson(box, search.value) });
  }

  function renderOutcome(): void {
    renderFacts();
    renderDownloads();
    renderOutput();
    renderData();
    if (outcome === null) {
      byId('c-headers').replaceChildren(h('p', { class: 'text-sm text-muted-foreground' }, t('c.idle.title')));
      byId('c-timing').replaceChildren(h('p', { class: 'text-sm text-muted-foreground' }, t('c.idle.title')));
    } else {
      headersView(byId('c-headers'), outcome.headers, i18n);
      timingView(byId('c-timing'), outcome.timing, i18n);
    }
  }

  // ---- History (opt-in, local) ---------------------------------------------------------

  const historyToggle = document.getElementById('c-history-on') as HTMLInputElement | null;
  const historyList = document.getElementById('c-history');
  const historyClear = document.getElementById('c-history-clear');

  function readHistory(): HistoryEntry[] | null {
    try {
      const raw = localStorage.getItem(STORAGE.history);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]).filter((entry) => isRecord(entry) && typeof entry.id === 'string' && isRecord(entry.values)) : [];
    } catch {
      return null;
    }
  }
  function writeHistory(entries: HistoryEntry[] | null): void {
    try {
      if (entries === null) localStorage.removeItem(STORAGE.history);
      else localStorage.setItem(STORAGE.history, JSON.stringify(entries.slice(0, 20)));
    } catch {
      // Storage unavailable: the history simply is not kept.
    }
    renderHistory();
  }
  function remember(next: Outcome): void {
    const entries = readHistory();
    if (entries === null || next.status === 0) return;
    const saved: Record<string, string> = {};
    for (const item of next.operation.params) {
      const value = item.name === 'url' ? urlInput.value.trim() : (values[item.name] ?? '');
      if (value !== '') saved[item.name] = value;
    }
    writeHistory([{ id: next.operation.id, values: saved, status: next.status, at: Date.now() }, ...entries]);
  }
  function renderHistory(): void {
    if (historyList === null || historyToggle === null) return;
    const entries = readHistory();
    historyToggle.checked = entries !== null;
    if (historyClear !== null) historyClear.hidden = entries === null || entries.length === 0;
    if (entries === null) return historyList.replaceChildren();
    if (entries.length === 0) return historyList.replaceChildren(h('li', { class: 'text-sm text-muted-foreground' }, t('hi.empty')));
    const time = new Intl.DateTimeFormat(i18n.lang() === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    historyList.replaceChildren(
      ...entries.map((entry) => {
        const label = `${entry.id.replace('/api/v1', '')} ${entry.values['url'] ?? ''}`;
        const button = h(
          'button',
          { type: 'button', class: 'history-item', 'aria-label': t('hi.restore', { request: label }) },
          h('span', { class: `badge ${entry.status < 400 ? 'badge-ok' : 'badge-error'}` }, String(entry.status)),
          h('span', { class: 'min-w-0 flex-1 truncate mono' }, label),
          h('span', { class: 'text-xs text-muted-foreground' }, time.format(entry.at)),
        );
        button.addEventListener('click', () => {
          for (const [name, value] of Object.entries(entry.values)) {
            if (name === 'url') urlInput.value = String(value);
            else values[name] = String(value);
          }
          setOperation(entry.id);
          urlInput.focus();
        });
        return h('li', {}, button);
      }),
    );
  }

  // ---- Batch -------------------------------------------------------------------------------

  const batchOperation = (): Operation | undefined => operations.find((item) => /\/meta\/batch$/.test(item.path));
  const batchMax = (): number => batchOperation()?.params.find((item) => item.name === 'urls')?.maxItems ?? 10;
  let batchResult: BatchRow[] = [];

  function batchRows(items: readonly unknown[]): BatchRow[] {
    return items.map((item): BatchRow => {
      const record = isRecord(item) ? item : {};
      const data = isRecord(record['data']) ? record['data'] : {};
      const ok = record['status'] === 'success';
      return {
        url: text(record['url']) ?? text(data['url']) ?? '',
        ok,
        title: text(data['title']) ?? '',
        site: text(data['publisher']) ?? text(data['domain']) ?? '',
        result: ok ? t('b.ok') : (text(record['code']) ?? text(isRecord(record['error']) ? record['error']['code'] : null) ?? 'error'),
      };
    });
  }

  async function runBatch(): Promise<void> {
    const area = byId<HTMLTextAreaElement>('c-batch-urls');
    const error = byId('c-batch-error');
    const target = byId('c-batch-result');
    const urls = [...new Set(area.value.split(/\s+/).filter(Boolean))].slice(0, batchMax());
    const invalid = urls.length === 0 || urls.some((url) => safeHttpUrl(url) === null);
    error.hidden = !invalid;
    error.textContent = invalid ? (urls.length === 0 ? t('b.empty') : t('c.error.invalidUrl')) : '';
    if (invalid) return area.focus();

    const button = byId<HTMLButtonElement>('c-batch-run');
    button.disabled = true;
    byId('c-batch-status').textContent = t('c.loading');
    target.hidden = false;
    target.replaceChildren(h('div', { class: 'skeleton skeleton-card', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')));
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    if (apiKey !== '') headers['x-api-key'] = apiKey;
    try {
      const batch = batchOperation();
      let items: unknown[];
      if (batch !== undefined) {
        const response = await fetch(batch.path, { method: 'POST', headers, body: JSON.stringify({ urls }) });
        const json: unknown = await response.json();
        if (!response.ok || !isRecord(json) || !Array.isArray(json['data'])) throw new Error(isRecord(json) ? String(json['code'] ?? response.status) : String(response.status));
        items = json['data'];
      } else {
        // No batch endpoint on this instance: one metadata request per address.
        items = await Promise.all(
          urls.map(async (url) => {
            const response = await fetch(`/api/v1/meta?${new URLSearchParams({ url }).toString()}`, { headers });
            const json: unknown = await response.json();
            return isRecord(json) ? { ...json, url } : { url, status: 'error' };
          }),
        );
      }
      batchResult = batchRows(items);
      batchView(target, batchResult, i18n);
      byId('c-batch-csv').hidden = false;
      byId('c-batch-status').textContent = t('j.items', { n: batchResult.length });
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : '';
      target.replaceChildren(h('p', { class: 'note' }, i18n.has(`why.${code}`) ? t(`why.${code}` as Key).replace(/`/g, '') : t('c.error.network')));
      byId('c-batch-status').textContent = t('a.failed', { code });
    } finally {
      button.disabled = false;
    }
  }

  // ---- Events --------------------------------------------------------------------------------

  byId('c-form-url').addEventListener('submit', (event) => {
    event.preventDefault();
    void run();
  });
  cancelButton.addEventListener('click', () => controller?.abort());
  urlInput.addEventListener('input', () => {
    if (urlInput.getAttribute('aria-invalid') === 'true') validate();
    renderDerived();
  });
  // A link dragged from another window lands in the field as its address.
  urlInput.addEventListener('dragover', (event) => event.preventDefault());
  urlInput.addEventListener('drop', (event) => {
    const dropped = event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || '';
    const url = safeHttpUrl(dropped.split(/\r?\n/).find((line) => !line.startsWith('#'))?.trim());
    if (url === null) return;
    event.preventDefault();
    urlInput.value = url;
    renderDerived();
  });
  byId('c-paste').addEventListener('click', () => {
    void (async () => {
      try {
        const pasted = safeHttpUrl((await navigator.clipboard.readText()).trim());
        if (pasted === null) throw new Error('not a URL');
        urlInput.value = pasted;
        renderDerived();
      } catch {
        toast(t('c.pasteFailed'), 'error');
        urlInput.focus();
      }
    })();
  });
  for (const chip of rootElement.querySelectorAll<HTMLElement>('[data-example]')) {
    chip.addEventListener('click', () => {
      urlInput.value = chip.dataset['example'] ?? '';
      validate();
      renderDerived();
    });
  }
  // Ctrl/Cmd + Enter runs the request from anywhere in the console.
  rootElement.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void run();
    }
  });

  const chips = document.getElementById('c-endpoints');
  if (chips !== null) {
    initTablist(chips, (tab) => {
      setOperation(tab.dataset['op'] ?? '');
      // Changing endpoint after a first run shows that endpoint's answer for the same address.
      if (outcome !== null && !fromKeyboard()) void run();
    });
  }
  document.getElementById('c-endpoint')?.addEventListener('change', (event) => setOperation((event.target as HTMLSelectElement).value));
  document.getElementById('c-key')?.addEventListener('input', (event) => {
    apiKey = (event.target as HTMLInputElement).value.trim();
    renderDerived();
  });
  document.getElementById('c-share')?.addEventListener('click', () => {
    const link = shareUrl();
    history.replaceState(null, '', link);
    void copyText(link).then((ok) => toast(ok ? t('c.shared') : link, ok ? 'info' : 'error'));
  });

  initTablist(views, (tab) => {
    markSelected(views, tab);
    for (const name of ['output', 'data', 'headers', 'timing', 'code']) {
      const panel = byId(`c-view-${name}`);
      panel.hidden = name !== tab.dataset['view'];
      panel.classList.toggle('panel-enter', !panel.hidden && !fromKeyboard());
    }
  });
  initTablist(codeTabs, (tab) => {
    codeLang = (tab.dataset['code'] ?? 'curl') as CodeLangId;
    markSelected(codeTabs, tab);
    byId('c-code-panel').setAttribute('aria-labelledby', tab.id);
    renderDerived();
  });
  byId<HTMLInputElement>('c-json-search').addEventListener('input', (event) => {
    const query = (event.target as HTMLInputElement).value;
    const count = filterJson(byId('c-json'), query);
    byId('c-json-count').textContent = query.trim() === '' ? '' : t('j.matches', { n: count });
  });
  byId('c-json-expand').addEventListener('click', () => setAllOpen(byId('c-json'), true));
  byId('c-json-collapse').addEventListener('click', () => setAllOpen(byId('c-json'), false));
  byId('c-fullscreen').addEventListener('click', () => {
    const panel = byId('c-response');
    if (document.fullscreenElement === null) void panel.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen();
  });

  historyToggle?.addEventListener('change', () => writeHistory(historyToggle.checked ? (readHistory() ?? []) : null));
  historyClear?.addEventListener('click', () => {
    writeHistory([]);
    toast(t('hi.cleared'));
  });

  const modes = document.getElementById('c-modes');
  if (modes !== null) {
    initTablist(modes, (tab) => {
      markSelected(modes, tab);
      byId('c-single').hidden = tab.dataset['mode'] !== 'single';
      byId('c-batch').hidden = tab.dataset['mode'] !== 'batch';
    });
    byId('c-batch-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void runBatch();
    });
    byId('c-batch-csv').addEventListener('click', () => {
      const csv = toCsv([t('b.url'), t('b.title'), t('b.site'), t('b.result')], batchResult.map((row) => [row.url, row.title, row.site, row.result]));
      download('omnillink-batch.csv', new Blob([`﻿${csv}`], { type: 'text/csv' }));
    });
  }

  i18n.onChange(() => {
    localizeSpec();
    renderOutcome();
    renderHistory();
    if (outcome === null) renderStatus('idle');
    if (!urlError.hidden) validate();
  });

  // ---- First paint ---------------------------------------------------------------------------

  renderStatus('idle');
  renderOutcome();
  renderHistory();
  if (full) void initSpec();
  else {
    // The landing demo accepts a pre-filled address: /?url=…#demo
    const preset = safeHttpUrl(new URLSearchParams(location.search).get('url'));
    if (preset !== null) urlInput.value = preset;
    setOperation(operation.id);
  }
  renderDerived();
}
