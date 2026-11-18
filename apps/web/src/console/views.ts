/**
 * Output views of the console: one per kind of response.
 *
 * Everything shown here comes from arbitrary web pages through the API. It is
 * rendered with elements, text nodes and validated URLs only — never as HTML.
 */
import type { consoleText } from '../i18n/fr/console';
import type { I18n } from '../i18n/runtime';
import { h, safeHttpUrl } from '../lib/dom';
import { renderMarkdown } from '../lib/markdown';
import { iconNode } from '../site/icons';

type Key = keyof typeof consoleText;
type T = I18n<Key>;
type Json = Record<string, unknown>;

export const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
export const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

/** A remote image that hides itself when the URL is absent, unsafe or broken. No referrer is sent. */
function remoteImage(source: unknown, cls: string, width: number, height: number): HTMLImageElement | null {
  const url = safeHttpUrl(source);
  if (url === null) return null;
  const image = h('img', { class: cls, alt: '', width: String(width), height: String(height), referrerpolicy: 'no-referrer', loading: 'lazy', src: url });
  image.addEventListener('error', () => image.remove());
  return image;
}

function formatDate(value: string, lang: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long' }).format(date);
}

function segmented(name: string, options: ReadonlyArray<readonly [string, string]>, current: string, onChange: (value: string) => void, legend: string): HTMLElement {
  const box = h('div', { class: 'segmented' });
  for (const [value, label] of options) {
    const input = h('input', { type: 'radio', name, value });
    input.checked = value === current;
    input.addEventListener('change', () => {
      if (input.checked) onChange(value);
    });
    box.append(h('label', {}, input, h('span', {}, label)));
  }
  return h('fieldset', {}, h('legend', { class: 'sr-only' }, legend), box);
}

// ---- /meta: a link preview in three formats -----------------------------------------

let cardFormat = 'large';

export function metaView(target: HTMLElement, data: Json, i18n: T): void {
  const pageUrl = safeHttpUrl(data['url']);
  const host = pageUrl === null ? '' : new URL(pageUrl).host;
  const title = text(data['title']) ?? i18n.t('m.untitled');
  const description = text(data['description']);
  const imageUrl = isRecord(data['image']) ? data['image']['url'] : null;

  const build = (): HTMLElement => {
    const favicon = remoteImage(data['favicon'], 'size-4 rounded-sm', 16, 16);
    const site = h('span', { class: 'card-site' }, favicon, h('span', { class: 'truncate mono' }, host));
    const body = h('span', { class: 'card-body' }, site, h('span', { class: 'card-title' }, title), description === null ? null : h('span', { class: 'card-desc' }, description));
    const image = remoteImage(imageUrl, 'card-image', 1200, 630);
    const card = h('a', { class: `link-card link-card-${cardFormat}`, target: '_blank', rel: 'noopener noreferrer nofollow' }, image, body);
    if (pageUrl !== null) card.href = pageUrl;
    if (cardFormat === 'element' && pageUrl !== null) {
      // The SDK's own element, as an integrator would embed it. It asks this instance for the
      // metadata of the address the visitor just ran, so nothing new leaves the page.
      const element = document.createElement('link-preview');
      element.setAttribute('url', pageUrl);
      element.setAttribute('base-url', location.origin);
      const note = h('p', { class: 'hint text-sm text-muted-foreground' });
      i18n.render(note, 'm.element.note');
      void import('../../../../packages/sdk/src/element.ts').catch(() => undefined);
      return h('div', { class: 'grid w-full max-w-xl gap-3 mx-auto' }, element, note);
    }
    return cardFormat === 'chat' ? h('div', { class: 'chat-bubble' }, h('p', { class: 'chat-text mono' }, pageUrl ?? ''), card) : card;
  };

  const stage = h('div', { class: 'card-stage' }, build());
  const formats = segmented(
    'c-card-format',
    [
      ['large', i18n.t('m.large')],
      ['compact', i18n.t('m.compact')],
      ['chat', i18n.t('m.chat')],
      ['element', '<link-preview>'],
    ],
    cardFormat,
    (value) => {
      cardFormat = value;
      stage.replaceChildren(build());
    },
    i18n.t('m.format'),
  );

  const date = text(data['date']);
  const facts: Array<readonly [Key, string | null]> = [
    ['m.author', text(data['author'])],
    ['m.publisher', text(data['publisher'])],
    ['m.date', date === null ? null : formatDate(date, i18n.lang())],
    ['m.lang', text(data['lang'])],
    ['m.type', text(data['type'])],
  ];
  const list = h('dl', { class: 'facts' }, ...facts.flatMap(([key, value]) => (value === null ? [] : [h('dt', {}, i18n.t(key)), h('dd', {}, value)])));
  target.replaceChildren(h('div', { class: 'view-toolbar' }, formats), stage, list);
}

// ---- Images: a screenshot in a device frame --------------------------------------------

export interface Shot {
  readonly url: string;
  readonly mobile: boolean;
  readonly label?: string;
}

function frame(shot: Shot, alt: string): HTMLElement {
  const image = h('img', { src: shot.url, alt, class: 'frame-screen' });
  const device = shot.mobile
    ? h('div', { class: 'device device-phone' }, h('span', { class: 'device-notch', 'aria-hidden': 'true' }), image)
    : h('div', { class: 'device device-desktop' }, h('span', { class: 'device-bar', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), image);
  return shot.label === undefined ? device : h('figure', { class: 'frame-figure' }, device, h('figcaption', {}, shot.label));
}

export function imageView(target: HTMLElement, shots: readonly Shot[], alt: string, toolbar: HTMLElement | null): void {
  target.replaceChildren(
    toolbar === null ? '' : h('div', { class: 'view-toolbar' }, toolbar),
    h('div', { class: `frame-stage${shots.length > 1 ? ' frame-stage-compare' : ''}`, tabindex: '0' }, ...shots.map((shot) => frame(shot, alt))),
  );
}

export function compareControl(i18n: T, current: string, onChange: (value: string) => void): HTMLElement {
  return segmented(
    'c-compare',
    [
      ['none', i18n.t('s.compare.none')],
      ['scheme', i18n.t('s.compare.scheme')],
      ['device', i18n.t('s.compare.device')],
    ],
    current,
    onChange,
    i18n.t('s.compare'),
  );
}

// ---- PDF --------------------------------------------------------------------------------

export function pdfView(target: HTMLElement, objectUrl: string, i18n: T): void {
  const preview = h('iframe', { class: 'pdf-frame', src: objectUrl, title: i18n.t('p.title') });
  target.replaceChildren(h('p', { class: 'text-sm text-muted-foreground' }, i18n.t('p.hint')), preview);
}

// ---- /extract: one row per field ---------------------------------------------------------

export function fieldsView(target: HTMLElement, fields: Json, i18n: T): void {
  const value = (item: unknown): Node => {
    if (item === null || item === undefined) return h('span', { class: 'text-muted-foreground' }, i18n.t('x.null'));
    if (Array.isArray(item)) return h('ul', { class: 'value-list' }, ...item.slice(0, 100).map((entry) => h('li', {}, String(entry))));
    return document.createTextNode(String(item));
  };
  const rows = Object.entries(fields).map(([name, item]) => h('tr', {}, h('th', { scope: 'row' }, h('code', { class: 'param-name' }, name)), h('td', {}, value(item))));
  target.replaceChildren(
    h(
      'div',
      { class: 'ref-table-wrap' },
      h('table', { class: 'ref-table ref-table-plain' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, i18n.t('x.field')), h('th', { scope: 'col' }, i18n.t('x.value')))), h('tbody', {}, ...rows)),
    ),
  );
}

// ---- /content: rendered Markdown next to its source ----------------------------------------

export function contentView(target: HTMLElement, data: Json, i18n: T, sideBySide: boolean): void {
  const markdown = text(data['markdown']) ?? text(data['text']);
  if (markdown === null) {
    target.replaceChildren(h('p', { class: 'text-muted-foreground' }, i18n.t('ct.empty')));
    return;
  }
  const rendered = h('div', { class: 'md', tabindex: '0' });
  renderMarkdown(rendered, markdown);
  const badges: string[] = [];
  if (typeof data['wordCount'] === 'number' && typeof data['readingTimeMinutes'] === 'number') {
    badges.push(i18n.t('ct.stats', { words: data['wordCount'], minutes: data['readingTimeMinutes'] }));
  }
  if (data['truncated'] === true) badges.push(i18n.t('ct.truncated'));
  const bar = h('p', { class: 'flex flex-wrap gap-1.5' }, ...badges.map((badge) => h('span', { class: 'badge' }, badge)));

  if (!sideBySide) {
    target.replaceChildren(bar, rendered);
    return;
  }
  const source = h('figure', { class: 'code' }, h('pre', { class: 'wrap', tabindex: '0' }, h('code', {}, markdown)));
  target.replaceChildren(
    bar,
    h(
      'div',
      { class: 'split' },
      h('div', { class: 'min-w-0' }, h('p', { class: 'pane-label mb-2' }, i18n.t('ct.rendered')), rendered),
      h('div', { class: 'min-w-0' }, h('p', { class: 'pane-label mb-2' }, i18n.t('ct.source')), source),
    ),
  );
}

// ---- Batch: one row per address -------------------------------------------------------------

export interface BatchRow {
  readonly url: string;
  readonly ok: boolean;
  readonly title: string;
  readonly site: string;
  readonly result: string;
}

export function batchView(target: HTMLElement, rows: readonly BatchRow[], i18n: T): void {
  const body = rows.map((row) =>
    h(
      'tr',
      {},
      h('th', { scope: 'row', class: 'mono break-all' }, row.url),
      h('td', {}, h('span', { class: 'cell-label' }, i18n.t('b.title')), row.title),
      h('td', {}, h('span', { class: 'cell-label' }, i18n.t('b.site')), row.site),
      h('td', {}, h('span', { class: `badge ${row.ok ? 'badge-ok' : 'badge-error'}` }, iconNode(row.ok ? 'check' : 'alert', 'size-3.5'), row.result)),
    ),
  );
  target.replaceChildren(
    h(
      'div',
      { class: 'ref-table-wrap' },
      h(
        'table',
        { class: 'ref-table ref-table-plain' },
        h('thead', {}, h('tr', {}, ...(['b.url', 'b.title', 'b.site', 'b.result'] as const).map((key) => h('th', { scope: 'col' }, i18n.t(key))))),
        h('tbody', {}, ...body),
      ),
    ),
  );
}

/** RFC 4180 CSV, with cells that could be read as formulas neutralised. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const cell = (value: string): string => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

// ---- Headers and timing -----------------------------------------------------------------------

export function headersView(target: HTMLElement, headers: ReadonlyArray<readonly [string, string]>, i18n: T): void {
  target.replaceChildren(
    h(
      'div',
      { class: 'ref-table-wrap' },
      h(
        'table',
        { class: 'ref-table ref-table-plain' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, i18n.t('h.name')), h('th', { scope: 'col' }, i18n.t('h.value')))),
        h('tbody', {}, ...headers.map(([name, value]) => h('tr', {}, h('th', { scope: 'row' }, h('code', { class: 'param-name' }, name)), h('td', { class: 'mono break-all' }, value)))),
      ),
    ),
  );
}

export interface Timing {
  readonly total: number;
  readonly headers: number;
  readonly body: number;
  readonly server: number | null;
}

export function timingView(target: HTMLElement, timing: Timing, i18n: T): void {
  const scale = Math.max(timing.total, 1);
  const row = (key: Key, ms: number, cls: string): HTMLElement => {
    const bar = h('span', { class: `timing-bar ${cls}` });
    bar.style.width = `${Math.max(1.5, (ms / scale) * 100).toFixed(1)}%`;
    return h('div', { class: 'timing-row' }, h('dt', {}, i18n.t(key)), h('dd', {}, h('span', { class: 'timing-track' }, bar), h('span', { class: 'timing-value' }, i18n.t('f.ms', { ms: Math.round(ms) }))));
  };
  target.replaceChildren(
    h(
      'dl',
      { class: 'timing' },
      row('t.total', timing.total, 'timing-total'),
      row('t.wait', timing.headers, ''),
      row('t.download', timing.body, ''),
      ...(timing.server === null ? [] : [row('t.server', timing.server, 'timing-server')]),
    ),
    h('p', { class: 'text-sm text-muted-foreground' }, i18n.t('t.note')),
  );
}

// ---- Generic structured view: scalar facts, then one table per list of records ----------------

const label = (i18n: T, key: string): string => (i18n.has(`col.${key}`) ? i18n.t(`col.${key}` as Key) : key);

function cell(value: unknown, i18n: T): Node {
  if (value === null || value === undefined || value === '') return h('span', { class: 'text-muted-foreground' }, '–');
  if (typeof value === 'boolean') return document.createTextNode(i18n.t(value ? 'col.yes' : 'col.no'));
  if (Array.isArray(value)) return document.createTextNode(value.map(String).join(', '));
  if (isRecord(value)) return h('code', { class: 'mono break-all' }, JSON.stringify(value));
  return document.createTextNode(String(value));
}

/** A table from a list of flat records: columns are the keys of the first rows, in order. */
export function recordsTable(items: readonly unknown[], i18n: T, limit = 60): HTMLElement {
  const records = items.filter(isRecord);
  const columns = [...new Set(records.slice(0, 20).flatMap((record) => Object.keys(record)))].slice(0, 6);
  const rows = records.slice(0, limit).map((record) =>
    h(
      'tr',
      {},
      ...columns.map((column, at) =>
        at === 0
          ? h('th', { scope: 'row', class: 'break-all' }, cell(record[column], i18n))
          : h('td', { class: 'break-all' }, h('span', { class: 'cell-label' }, label(i18n, column)), cell(record[column], i18n)),
      ),
    ),
  );
  const table = h(
    'div',
    { class: 'ref-table-wrap' },
    h('table', { class: 'ref-table ref-table-plain' }, h('thead', {}, h('tr', {}, ...columns.map((column) => h('th', { scope: 'col' }, label(i18n, column))))), h('tbody', {}, ...rows)),
  );
  if (records.length <= limit) return table;
  return h('div', { class: 'grid gap-2' }, table, h('p', { class: 'text-sm text-muted-foreground' }, i18n.t('col.more', { n: records.length - limit })));
}

function factList(entries: ReadonlyArray<readonly [string, unknown]>, i18n: T): HTMLElement {
  return h('dl', { class: 'facts' }, ...entries.flatMap(([key, value]) => [h('dt', {}, label(i18n, key)), h('dd', {}, cell(value, i18n))]));
}

/**
 * Structured answers without a dedicated view: the scalar fields as a list of
 * facts, then a table for every list of records (technologies, links, URLs…).
 */
export function autoView(target: HTMLElement, data: Json, i18n: T): void {
  const scalars = Object.entries(data).filter(([, value]) => value === null || typeof value !== 'object');
  const nodes: Node[] = [];
  if (scalars.length > 0) nodes.push(factList(scalars, i18n));
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.some(isRecord)) nodes.push(h('p', { class: 'pane-label' }, label(i18n, key)), recordsTable(value, i18n));
    else if (isRecord(value) && Object.values(value).every((item) => item === null || typeof item !== 'object')) nodes.push(h('p', { class: 'pane-label' }, label(i18n, key)), factList(Object.entries(value), i18n));
  }
  target.replaceChildren(...nodes);
}

// ---- /insights: lab measurements, with their caveat ------------------------------------------

const kb = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(1)} kB` : `${(bytes / 1_048_576).toFixed(2)} MB`);

function bars(rows: ReadonlyArray<readonly [string, number, string]>, cls: string): HTMLElement {
  const scale = Math.max(1, ...rows.map(([, value]) => value));
  return h(
    'dl',
    { class: 'timing' },
    ...rows.map(([name, value, shown]) => {
      const bar = h('span', { class: `timing-bar ${cls}` });
      bar.style.width = `${Math.max(1.5, (value / scale) * 100).toFixed(1)}%`;
      return h('div', { class: 'timing-row' }, h('dt', {}, name), h('dd', {}, h('span', { class: 'timing-track' }, bar), h('span', { class: 'timing-value' }, shown)));
    }),
  );
}

export function insightsView(target: HTMLElement, data: Json, i18n: T): void {
  const timings = isRecord(data['timings']) ? data['timings'] : {};
  const vitals = isRecord(data['vitals']) ? data['vitals'] : {};
  const network = isRecord(data['network']) ? data['network'] : {};
  const byType = isRecord(network['byType']) ? network['byType'] : {};
  const ms = (key: string, source: Json): Array<readonly [string, number, string]> =>
    typeof source[key] === 'number' ? [[i18n.t(`iv.${key}` as Key), source[key], i18n.t('f.ms', { ms: Math.round(source[key]) })]] : [];
  const weights = Object.entries(byType)
    .flatMap(([type, value]): Array<readonly [string, number, string]> =>
      isRecord(value) && typeof value['transferBytes'] === 'number' && typeof value['requests'] === 'number' && value['requests'] > 0
        ? [[`${type} · ${i18n.t('iv.requests', { n: value['requests'] })}`, value['transferBytes'], kb(value['transferBytes'])]]
        : [],
    )
    .sort((a, b) => b[1] - a[1]);
  const third = isRecord(network['thirdParty']) ? network['thirdParty']['hostCount'] : null;
  const dom = isRecord(data['dom']) ? data['dom']['elements'] : null;
  const facts: Array<readonly [string, string]> = [];
  if (typeof network['transferBytes'] === 'number') facts.push([i18n.t('iv.total'), kb(network['transferBytes'])]);
  if (typeof vitals['cls'] === 'number') facts.push([i18n.t('iv.cls'), String(vitals['cls'])]);
  if (typeof dom === 'number') facts.push([i18n.t('iv.dom'), String(dom)]);
  if (typeof third === 'number') facts.push([i18n.t('iv.third'), String(third)]);

  target.replaceChildren(
    h('p', { class: 'note' }, i18n.t('iv.caveat')),
    h('dl', { class: 'facts' }, ...facts.flatMap(([name, value]) => [h('dt', {}, name), h('dd', {}, value)])),
    h('p', { class: 'pane-label' }, i18n.t('iv.timings')),
    bars([...ms('ttfbMs', timings), ...ms('fcpMs', vitals), ...ms('lcpMs', vitals), ...ms('domContentLoadedMs', timings), ...ms('loadMs', timings)], ''),
    h('p', { class: 'pane-label' }, i18n.t('iv.weight')),
    bars(weights, 'timing-total'),
    ...(Array.isArray(data['technologies']) && data['technologies'].length > 0 ? [recordsTable(data['technologies'], i18n)] : []),
  );
}

// ---- /check: the redirect chain, hop by hop ---------------------------------------------------

export function checkView(target: HTMLElement, data: Json, i18n: T): void {
  const hops = Array.isArray(data['redirects']) ? data['redirects'].filter(isRecord) : [];
  const chain = h(
    'ol',
    { class: 'chain' },
    ...hops.map((hop) =>
      h(
        'li',
        {},
        h('span', { class: `badge ${typeof hop['status'] === 'number' && hop['status'] < 400 ? 'badge-ok' : 'badge-error'}` }, String(hop['status'] ?? '–')),
        h('span', { class: 'mono break-all min-w-0 flex-1' }, String(hop['url'] ?? '')),
        h('span', { class: 'text-xs text-muted-foreground' }, typeof hop['durationMs'] === 'number' ? i18n.t('f.ms', { ms: hop['durationMs'] }) : ''),
      ),
    ),
  );
  const tls = data['tls'];
  target.replaceChildren(
    factList(
      (['ok', 'status', 'finalUrl', 'contentType', 'durationMs'] as const).filter((key) => key in data).map((key) => [key, data[key]] as const),
      i18n,
    ),
    h('p', { class: 'pane-label' }, i18n.t('cv.chain')),
    chain,
    h('p', { class: 'pane-label' }, i18n.t('cv.tls')),
    isRecord(tls) ? factList(Object.entries(tls).filter(([, value]) => value === null || typeof value !== 'object'), i18n) : h('p', { class: 'text-sm text-muted-foreground' }, i18n.t('cv.tls.none')),
  );
}

// ---- /palette: swatches that copy their colour -------------------------------------------------

export function paletteView(target: HTMLElement, data: Json, i18n: T, onCopy: (hex: string) => void): void {
  const colors = Array.isArray(data['colors']) ? data['colors'].filter(isRecord) : [];
  const swatches = colors.flatMap((color) => {
    const hex = typeof color['hex'] === 'string' && /^#[0-9a-f]{3,8}$/i.test(color['hex']) ? color['hex'] : null;
    if (hex === null) return [];
    const chip = h('span', { class: 'swatch-chip' });
    chip.style.backgroundColor = hex;
    const share = typeof color['population'] === 'number' ? i18n.t('pv.share', { percent: Math.round(color['population'] * 100) }) : '';
    const button = h('button', { type: 'button', class: 'swatch', 'aria-label': i18n.t('pv.copy', { hex }) }, chip, h('span', { class: 'mono' }, hex), h('span', { class: 'text-xs text-muted-foreground' }, share));
    button.addEventListener('click', () => onCopy(hex));
    return [button];
  });
  target.replaceChildren(h('div', { class: 'swatches' }, ...swatches));
}

// ---- /oembed: the provider's markup is shown as text, never run --------------------------------

export function oembedView(target: HTMLElement, data: Json, i18n: T): void {
  const html = typeof data['html'] === 'string' ? data['html'] : null;
  const scalars = Object.entries(data).filter(([key, value]) => key !== 'html' && value !== null && typeof value !== 'object');
  target.replaceChildren(
    factList(scalars, i18n),
    ...(html === null ? [] : [h('p', { class: 'note' }, i18n.t('ov.html')), h('figure', { class: 'code' }, h('pre', { class: 'wrap', tabindex: '0' }, h('code', {}, html)))]),
  );
}

// ---- /tables: each table rendered, with its CSV --------------------------------------------------

export function tablesView(target: HTMLElement, data: Json, i18n: T, onCsv: (name: string, csv: string) => void): void {
  const tables = Array.isArray(data['tables']) ? data['tables'].filter(isRecord) : [];
  if (tables.length === 0) {
    target.replaceChildren(h('p', { class: 'text-muted-foreground' }, i18n.t('tb.none')));
    return;
  }
  target.replaceChildren(
    ...tables.flatMap((table, at) => {
      const headers = Array.isArray(table['headers']) ? table['headers'].map(String) : [];
      const rows = Array.isArray(table['rows']) ? table['rows'].filter(Array.isArray).map((row) => (row as unknown[]).map((value) => (value === null ? '' : String(value)))) : [];
      const title = typeof table['caption'] === 'string' && table['caption'] !== '' ? table['caption'] : i18n.t('tb.table', { n: at + 1 });
      const csv = h('button', { type: 'button', class: 'tool-btn tool-btn-text' }, iconNode('download', 'size-4'), h('span', {}, 'CSV'));
      csv.addEventListener('click', () => onCsv(`table-${at + 1}.csv`, toCsv(headers, rows)));
      return [
        h('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, h('p', { class: 'pane-label' }, title), csv),
        h(
          'div',
          { class: 'ref-table-wrap overflow-x-auto' },
          h(
            'table',
            { class: 'ref-table ref-table-plain ref-table-data' },
            h('thead', {}, h('tr', {}, ...headers.map((header) => h('th', { scope: 'col' }, header)))),
            h('tbody', {}, ...rows.slice(0, 100).map((row) => h('tr', {}, ...row.map((value) => h('td', {}, value))))),
          ),
        ),
      ];
    }),
  );
}

/** A plain image result (QR code, sharing image, animation, icon): no device frame. */
export function pictureView(target: HTMLElement, url: string, alt: string): void {
  target.replaceChildren(h('div', { class: 'frame-stage', tabindex: '0' }, h('img', { src: url, alt, class: 'picture' })));
}

/** Two captures under one slider: drag, or use the arrow keys, to reveal one over the other. */
export function sliderView(target: HTMLElement, shots: readonly Shot[], alt: string, toolbar: HTMLElement | null, sliderLabel: string): void {
  const [first, second] = shots;
  if (first === undefined || second === undefined) return imageView(target, shots, alt, toolbar);
  const top = h('div', { class: 'compare-top' }, h('img', { src: second.url, alt: `${alt} · ${second.label ?? ''}` }));
  const range = h('input', { type: 'range', min: '0', max: '100', value: '50', class: 'compare-range', 'aria-label': sliderLabel });
  const stage = h('div', { class: 'compare' }, h('img', { src: first.url, alt: `${alt} · ${first.label ?? ''}` }), top, range);
  const place = (): void => stage.style.setProperty('--split', `${range.value}%`);
  range.addEventListener('input', place);
  place();
  target.replaceChildren(
    toolbar === null ? '' : h('div', { class: 'view-toolbar' }, toolbar),
    h('p', { class: 'flex justify-between text-sm font-semibold text-foreground' }, h('span', {}, first.label ?? ''), h('span', {}, second.label ?? '')),
    h('div', { class: 'frame-stage' }, stage),
  );
}
