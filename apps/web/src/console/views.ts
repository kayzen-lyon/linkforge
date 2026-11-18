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
    return cardFormat === 'chat' ? h('div', { class: 'chat-bubble' }, h('p', { class: 'chat-text mono' }, pageUrl ?? ''), card) : card;
  };

  const stage = h('div', { class: 'card-stage' }, build());
  const formats = segmented(
    'c-card-format',
    [
      ['large', i18n.t('m.large')],
      ['compact', i18n.t('m.compact')],
      ['chat', i18n.t('m.chat')],
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
