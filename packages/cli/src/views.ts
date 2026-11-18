/**
 * Human-readable rendering of the endpoints added after the first five.
 * Pure functions: strings in, strings out, and everything that comes from a
 * remote page goes through `clean()` before it reaches the terminal.
 */
import type {
  FaviconData,
  ImageData,
  InsightsData,
  LinkCheck,
  LinksData,
  MetaBatchItem,
  OembedData,
  OmnillinkResult,
  PageTable,
  PaletteData,
  PresetData,
  ResourceKind,
  SiteIcon,
  SitemapData,
  TablesData,
  TechData,
  Technology,
} from '@omnillink/sdk';

import { clean, footer, formatBytes, rows, scalar, truncate, type Style } from './format.js';

/** Width used when the terminal does not say (a pipe, a test). */
export const DEFAULT_COLUMNS = 100;

const length = (text: string): number => Array.from(text).length;
const pad = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - length(text)));
const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
const ms = (value: number | null | undefined): string | null =>
  typeof value !== 'number' ? null : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
const more = (hidden: number, style: Style): string[] => (hidden > 0 ? [style.dim(`  … ${hidden} more (use --json for all)`)] : []);

/** Columns of plain text; `paint` colours a cell after it has been padded. */
function grid(
  header: readonly string[],
  body: readonly (readonly string[])[],
  style: Style,
  paint: (cell: string, column: number, row: number) => string = (cell) => cell,
): string[] {
  const widths = header.map((title, column) => Math.max(length(title), ...body.map((row) => length(row[column] ?? ''))));
  const line = (cells: readonly string[], render: (cell: string, column: number) => string): string =>
    `  ${cells.map((cell, column) => render(column === cells.length - 1 ? cell : pad(cell, widths[column] ?? 0), column)).join('  ')}`.trimEnd();
  return [line(header, (cell) => style.dim(cell)), ...body.map((row, index) => line(row, (cell, column) => paint(cell, column, index)))];
}

// ---- tech ------------------------------------------------------------------------------------

const CONFIDENCE: Readonly<Record<string, string>> = { high: '●●● high', medium: '●●○ medium', low: '●○○ low' };

function techRows(technologies: readonly Technology[], style: Style, columns: number): string[] {
  const cells = technologies.map((tech) => [
    clean(tech.name) + (tech.version === null ? '' : ` ${clean(tech.version)}`),
    clean(tech.category),
    CONFIDENCE[tech.confidence] ?? clean(String(tech.confidence)),
    clean(tech.evidence),
  ]);
  const fixed = [0, 1, 2].map((column) => Math.max(10, ...cells.map((row) => length(row[column] ?? ''))));
  const room = Math.max(24, columns - 2 - fixed.reduce((sum, width) => sum + width + 2, 0));
  const body = cells.map((row) => [row[0] ?? '', row[1] ?? '', row[2] ?? '', truncate(row[3] ?? '', room)]);
  return grid(['Technology', 'Category', 'Confidence', 'Evidence'], body, style, (cell, column, row) => {
    if (column === 0) return style.bold(cell);
    if (column === 2) {
      const level = technologies[row]?.confidence;
      return level === 'high' ? style.green(cell) : level === 'medium' ? style.yellow(cell) : style.dim(cell);
    }
    return column === 3 ? style.dim(cell) : cell;
  });
}

export function formatTech(result: OmnillinkResult<TechData>, style: Style, columns = DEFAULT_COLUMNS): string {
  const { data } = result;
  const inspected = `${plural(data.inspected.bundles, 'bundle')} read · ${data.inspected.rendered ? 'rendered in a browser' : 'not rendered'}`;
  return [
    style.cyan(clean(data.url)),
    ...(data.technologies.length === 0
      ? [style.dim('  Nothing recognised. That is not proof of absence: see what was inspected below.')]
      : techRows(data.technologies, style, columns)),
    style.dim(`  ${plural(data.technologies.length, 'technology', 'technologies')} · ${inspected}`),
    footer(result.meta, style),
  ].join('\n');
}

// ---- check -----------------------------------------------------------------------------------

function statusColor(status: number, style: Style): (text: string) => string {
  return status >= 400 ? style.red : status >= 300 ? style.cyan : style.green;
}

export function formatCheck(result: OmnillinkResult<LinkCheck, { readonly durationMs: number }>, style: Style): string {
  const { data } = result;
  const hops = data.redirects;
  const chain = hops.map((hop, index) => {
    const branch = index === hops.length - 1 ? '└─' : '├─';
    const duration = ms(hop.durationMs) ?? '';
    return `  ${style.dim(branch)} ${statusColor(hop.status, style)(String(hop.status))}  ${clean(hop.url)}  ${style.dim(duration)}`.trimEnd();
  });
  const tls = data.tls;
  const expiry =
    tls === null
      ? null
      : `${[tls.subject, tls.issuer].filter((part): part is string => part !== null).map(clean).join(' · ')} · expires ${clean(tls.validTo).slice(0, 10)} ` +
        (tls.daysLeft < 0 ? style.red('(expired)') : tls.daysLeft < 15 ? style.yellow(`(${plural(tls.daysLeft, 'day')} left)`) : style.dim(`(${plural(tls.daysLeft, 'day')} left)`));
  const redirects = hops.length - 1;
  const verdict = data.ok ? style.green('✓') : style.red('✗');
  return [
    `${verdict} ${statusColor(data.status, style)(style.bold(String(data.status)))}  ${style.cyan(clean(data.finalUrl))}  ${style.dim(redirects > 0 ? plural(redirects, 'redirect') : 'direct')}`,
    ...(redirects > 0 ? chain : []),
    ...rows(
      [
        ['Type', data.contentType === null ? null : clean(data.contentType)],
        ['Length', data.contentLength === null ? null : formatBytes(data.contentLength)],
        ['TLS', expiry],
        ['Time', ms(data.durationMs)],
      ],
      style,
    ),
  ].join('\n');
}

// ---- palette ---------------------------------------------------------------------------------

/** Six cells painted with the colour itself, when the terminal can. */
function swatch(rgb: readonly number[], style: Style): string {
  const [r = 0, g = 0, b = 0] = rgb.map((channel) => Math.max(0, Math.min(255, Math.round(Number(channel) || 0))));
  return style.enabled ? `\u001b[48;2;${r};${g};${b}m      \u001b[49m` : '';
}

export function formatPalette(result: OmnillinkResult<PaletteData>, style: Style): string {
  const { data } = result;
  const lines = data.colors.map((color) => {
    const share = Math.max(0, Math.min(1, Number(color.population) || 0));
    const bar = '█'.repeat(Math.max(1, Math.round(share * 24)));
    const block = swatch(color.rgb, style);
    const hex = clean(String(color.hex));
    return `  ${block === '' ? '' : `${block}  `}${style.bold(hex)}  ${style.dim(pad(`rgb(${color.rgb.map((channel) => Number(channel)).join(', ')})`, 18))} ${pad(`${(share * 100).toFixed(1)} %`, 7)} ${style.dim(bar)}`;
  });
  return [
    style.cyan(clean(data.url)),
    ...rows(
      [
        ['Page', data.pageUrl === null ? null : clean(data.pageUrl)],
        ['Format', data.format === null ? null : clean(data.format)],
        ['Dominant', clean(String(data.dominant))],
      ],
      style,
    ),
    ...lines,
    footer(result.meta, style),
  ].join('\n');
}

// ---- links -----------------------------------------------------------------------------------

const MAX_LINKS = 60;

export function formatLinks(result: OmnillinkResult<LinksData>, style: Style, columns = DEFAULT_COLUMNS): string {
  const { data } = result;
  const shown = data.links.slice(0, MAX_LINKS);
  const textWidth = Math.min(36, Math.max(4, ...shown.map((link) => length(truncate(clean(link.text), 36)))));
  const urlWidth = Math.max(30, columns - textWidth - 22);
  const lines = shown.map((link) => {
    const marker = link.internal ? style.dim('·') : style.yellow('↗');
    const text = pad(truncate(clean(link.text) || '(no text)', 36), textWidth);
    const flags = link.nofollow ? style.dim(' nofollow') : '';
    return `  ${marker} ${text}  ${style.cyan(truncate(clean(link.url), urlWidth))}${flags}`;
  });
  const summary = `${plural(data.total, 'link')} · ${data.internal} internal · ${data.external} external${data.truncated ? ' · truncated by --limit' : ''}`;
  return [
    style.cyan(clean(data.url)),
    style.dim(`  ${summary}   (· internal, ↗ external)`),
    ...lines,
    ...more(data.links.length - shown.length, style),
    footer(result.meta, style),
  ].join('\n');
}

// ---- tables ----------------------------------------------------------------------------------

const MAX_TABLE_ROWS = 25;

function drawTable(table: PageTable, style: Style, columns: number): string[] {
  const count = Math.max(1, table.columnCount, table.headers.length);
  const cell = (value: string | undefined): string => clean(value ?? '');
  const header = Array.from({ length: count }, (_, index) => cell(table.headers[index]));
  const body = table.rows.slice(0, MAX_TABLE_ROWS).map((row) => Array.from({ length: count }, (_, index) => cell(row[index])));
  // Share the terminal between the columns: never wider than the content, never narrower than 3.
  const budget = Math.max(3, Math.floor((columns - 4 - 3 * (count - 1)) / count));
  const widths = header.map((title, index) => Math.max(3, Math.min(budget, Math.max(length(title), ...body.map((row) => length(row[index] ?? ''))))));
  const line = (cells: readonly string[], paint: (text: string) => string): string =>
    `  ${cells.map((value, index) => paint(pad(truncate(value, widths[index] ?? 3), widths[index] ?? 3))).join(style.dim(' │ '))}`.trimEnd();
  const rule = `  ${widths.map((width) => '─'.repeat(width)).join('─┼─')}`;
  const hasHeader = table.headers.length > 0;
  return [
    `  ${style.bold(`Table ${table.index}`)}${table.caption === null ? '' : ` — ${clean(table.caption)}`}  ${style.dim(`${plural(table.rowCount, 'row')} × ${plural(table.columnCount, 'column')}${table.truncated ? ', truncated' : ''}`)}`,
    ...(hasHeader ? [line(header, style.bold), style.dim(rule)] : []),
    ...body.map((row) => line(row, (text) => text)),
    ...more(table.rows.length - body.length, style),
  ];
}

export function formatTables(result: OmnillinkResult<TablesData>, style: Style, columns = DEFAULT_COLUMNS): string {
  const { data } = result;
  return [
    style.cyan(clean(data.url)),
    ...(data.tables.length === 0 ? [style.dim('  No data table on this page.')] : data.tables.flatMap((table) => ['', ...drawTable(table, style, columns)])),
    '',
    style.dim(`  ${plural(data.total, 'table')}${data.truncated ? ' · truncated by a server cap' : ''} · --csv [--table <index>] exports one`),
    footer(result.meta, style),
  ].join('\n');
}

// ---- insights --------------------------------------------------------------------------------

const KINDS: readonly ResourceKind[] = ['document', 'script', 'stylesheet', 'image', 'font', 'media', 'xhr', 'other'];

export function formatInsights(result: OmnillinkResult<InsightsData>, style: Style, columns = DEFAULT_COLUMNS): string {
  const { data } = result;
  const { network, timings, vitals } = data;
  const total = Math.max(1, network.transferBytes);
  const weights = KINDS.filter((kind) => (network.byType[kind]?.requests ?? 0) > 0).map((kind) => {
    const weight = network.byType[kind];
    return [kind, String(weight.requests), formatBytes(weight.transferBytes), '█'.repeat(Math.max(1, Math.round((weight.transferBytes / total) * 24)))];
  });
  const hosts = network.thirdParty.hosts.map(clean);
  return [
    `${style.cyan(clean(data.url))}  ${style.dim(`${data.device} · HTTP ${data.status} · measured ${clean(data.measuredAt)}`)}`,
    style.yellow('  Lab measurement: one load, cold cache, no throttling, data-centre browser. Not a field score.'),
    ...(data.loaded ? [] : [style.yellow('  The load event did not fire in time: the figures are partial.')]),
    '',
    ...rows(
      [
        ['TTFB', ms(timings.ttfbMs)],
        ['DOMContentLoaded', ms(timings.domContentLoadedMs)],
        ['Load', ms(timings.loadMs)],
        ['First Contentful Paint', ms(vitals.fcpMs)],
        ['Largest Contentful Paint', ms(vitals.lcpMs) === null ? null : `${ms(vitals.lcpMs)}${vitals.lcpElement === null ? '' : style.dim(` <${clean(vitals.lcpElement)}>`)}`],
        ['Cumulative Layout Shift', vitals.cls === null ? null : String(vitals.cls)],
        ['DOM elements', data.dom.elements === null ? null : String(data.dom.elements)],
        ['Requests', String(network.requests)],
        ['Transferred', formatBytes(network.transferBytes) + (network.limitReached === null ? '' : style.yellow(` (stopped by the ${network.limitReached} cap: a lower bound)`))],
        [
          'Third parties',
          network.thirdParty.hostCount === 0
            ? 'none'
            : `${plural(network.thirdParty.hostCount, 'host')}, ${plural(network.thirdParty.requests, 'request')}, ${formatBytes(network.thirdParty.transferBytes)}`,
        ],
      ],
      style,
    ),
    ...(hosts.length === 0 ? [] : [style.dim(`  ${truncate(hosts.join(', '), Math.max(40, columns - 4))}`)]),
    '',
    ...grid(['Type', 'Requests', 'Bytes', ''], weights, style, (cell, column) => (column === 3 ? style.dim(cell) : cell)),
    ...(data.technologies.length === 0 ? [] : ['', ...techRows(data.technologies, style, columns)]),
    footer(result.meta, style),
  ].join('\n');
}

// ---- image, favicon, oembed, sitemap -----------------------------------------------------------

const size = (width: number | null, height: number | null): string | null => (width === null || height === null ? null : `${width}×${height}`);

export function formatImage(result: OmnillinkResult<ImageData>, style: Style): string {
  const { data } = result;
  return [
    style.cyan(clean(data.url)),
    ...rows(
      [
        ['Page', data.pageUrl === null ? null : clean(data.pageUrl)],
        ['Format', data.format === null ? style.dim('not recognised') : clean(data.format)],
        ['Size', size(data.width, data.height)],
        ['Weight', data.bytes === null ? null : formatBytes(data.bytes)],
        ['Type', data.contentType === null ? null : clean(data.contentType)],
      ],
      style,
    ),
    footer(result.meta, style),
  ].join('\n');
}

const iconCells = (icon: SiteIcon): string[] => [
  size(icon.width, icon.height) ?? 'vector',
  icon.format === null ? '?' : clean(icon.format),
  clean(icon.rel),
  icon.bytes === null ? '' : formatBytes(icon.bytes),
  clean(icon.url),
];

export function formatFavicon(result: OmnillinkResult<FaviconData>, style: Style): string {
  const { data } = result;
  return [
    `${style.bold(clean(data.icon.url))}  ${style.dim(`best icon of ${clean(data.pageUrl)}`)}`,
    ...grid(['Size', 'Format', 'Declared as', 'Weight', 'URL'], data.icons.map(iconCells), style, (cell, column, row) =>
      data.icons[row]?.url === data.icon.url && column === 0 ? style.green(cell) : column === 4 ? style.cyan(cell) : cell,
    ),
    footer(result.meta, style),
  ].join('\n');
}

export function formatOembed(result: OmnillinkResult<OembedData>, style: Style): string {
  const { data } = result;
  return [
    style.bold(data.title === null ? style.dim('(no title)') : clean(data.title)),
    `  ${style.cyan(clean(data.url))}`,
    ...rows(
      [
        ['Type', data.type === null ? null : clean(data.type)],
        ['Provider', [data.providerName, data.providerUrl].filter((part): part is string => part !== null).map(clean).join(' · ') || null],
        ['Author', [data.authorName, data.authorUrl].filter((part): part is string => part !== null).map(clean).join(' · ') || null],
        ['Size', size(data.width, data.height)],
        ['Thumbnail', data.thumbnailUrl === null ? null : `${clean(data.thumbnailUrl)}${size(data.thumbnailWidth, data.thumbnailHeight) === null ? '' : style.dim(` (${size(data.thumbnailWidth, data.thumbnailHeight)})`)}`],
        ['Photo', data.photoUrl === null ? null : clean(data.photoUrl)],
        ['Cache age', data.cacheAge === null ? null : `${data.cacheAge} s`],
        ['Endpoint', clean(data.endpoint)],
        // Shown as text, cut short: this is markup written by a third party.
        ['HTML', data.html === null ? null : `${truncate(clean(data.html), 160)} ${style.yellow('(untrusted markup)')}`],
      ],
      style,
    ),
    footer(result.meta, style),
  ].join('\n');
}

const MAX_URLS = 30;

export function formatSitemap(result: OmnillinkResult<SitemapData>, style: Style): string {
  const { data } = result;
  const files = data.sitemaps.map((file) => [clean(file.kind), file.kind === 'index' ? '—' : String(file.urlCount), clean(file.url), file.error === null ? '' : clean(file.error)]);
  const urls = data.urls.slice(0, MAX_URLS);
  return [
    `${data.robotsFound ? style.green('✓') : style.yellow('–')} ${style.cyan(clean(data.robotsUrl))}  ${style.dim(data.robotsFound ? 'robots.txt found' : 'no robots.txt')}`,
    ...(files.length === 0
      ? [style.dim('  No sitemap found.')]
      : grid(['Kind', 'URLs', 'File', ''], files, style, (cell, column) => (column === 3 ? style.red(cell) : column === 2 ? style.cyan(cell) : cell))),
    '',
    ...urls.map((entry) => `  ${clean(entry.url)}${entry.lastmod === null ? '' : style.dim(`  ${clean(entry.lastmod)}`)}`),
    ...more(data.urls.length - urls.length, style),
    style.dim(`  ${plural(data.urlCount, 'URL')} in ${plural(data.sitemaps.length, 'file')}${data.truncated ? ' · truncated by a cap' : ''}`),
    footer(result.meta, style),
  ].join('\n');
}

// ---- extract --preset, batch -------------------------------------------------------------------

export function formatPreset(result: OmnillinkResult<PresetData>, style: Style): string {
  const { data } = result;
  const fields = Object.entries(data.fields as Readonly<Record<string, unknown>>);
  const sources = data.sources as Readonly<Record<string, string | null>>;
  const width = Math.max(0, ...fields.map(([name]) => length(clean(name))));
  const lines = fields.flatMap(([name, value]) => {
    const label = `  ${style.dim(pad(clean(name), width))}  `;
    const source = sources[name];
    const from = typeof source === 'string' ? style.dim(`  ← ${clean(source)}`) : '';
    if (!Array.isArray(value)) return [`${label}${scalar(value, style)}${from}`];
    const indent = ' '.repeat(width + 4);
    return [
      `${label}${style.dim(plural(value.length, 'item'))}${from}`,
      ...value.slice(0, 12).map((item) => `${indent}${style.dim('-')} ${scalar(item, style)}`),
      ...(value.length > 12 ? [`${indent}${style.dim(`… ${value.length - 12} more (use --json for all)`)}`] : []),
    ];
  });
  const kind = data.schemaType === null ? 'no schema.org type declared' : `schema.org ${clean(data.schemaType)}`;
  return [`${style.cyan(clean(data.url))}  ${style.dim(`${clean(data.preset)} preset · ${kind}`)}`, ...lines, footer(result.meta, style)].join('\n');
}

export function formatBatchItem(item: MetaBatchItem, style: Style): string {
  if (item.status !== 'success') {
    return `${style.red('✗')} ${style.bold(clean(item.code))}  ${style.dim(truncate(clean(item.url), 80))}  ${clean(item.message)}`;
  }
  const title = item.data.title === null ? style.dim('(no title)') : style.bold(truncate(clean(item.data.title), 70));
  return `${style.green('✓')} ${title}  ${style.cyan(truncate(clean(item.data.url), 80))}${item.cached ? style.dim('  cached') : ''}`;
}

// ---- qr --------------------------------------------------------------------------------------

/**
 * Reads the modules back from the SVG the API draws: one `M x y h run v1 h-run z`
 * rectangle per horizontal run of dark modules, in a `0 0 span span` view box.
 * Returns `null` when the document is not shaped that way.
 */
export function parseQrSvg(svg: string): boolean[][] | null {
  const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const path = /<path[^>]*\sd="([^"]*)"/.exec(svg);
  if (box === null || path === null) return null;
  const span = Number(box[1]);
  if (!Number.isInteger(span) || span < 21 || span > 300 || span !== Number(box[2])) return null;
  const modules = Array.from({ length: span }, () => Array.from({ length: span }, () => false));
  const run = /M(\d+) (\d+)h(\d+)v1h-\d+z/g;
  let seen = 0;
  for (let match = run.exec(path[1] ?? ''); match !== null; match = run.exec(path[1] ?? '')) {
    const [x, y, width] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y >= span || x + width > span) return null;
    const row = modules[y];
    if (row === undefined) return null;
    for (let offset = 0; offset < width; offset += 1) row[x + offset] = true;
    seen += 1;
  }
  return seen === 0 ? null : modules;
}

/**
 * Draws the code with half blocks, two modules per character cell.
 *
 * With colours the cells are painted black on white, which scans on any
 * theme. Without, only the light modules are drawn, as full blocks in the
 * terminal's own foreground: right on a dark theme; `invert` is for a light one.
 */
export function renderQr(modules: readonly (readonly boolean[])[], options: { readonly color: boolean; readonly invert: boolean }): string {
  const span = modules.length;
  const dark = (x: number, y: number): boolean => (modules[y]?.[x] === true) !== options.invert;
  const lines: string[] = [];
  for (let y = 0; y < span; y += 2) {
    let line = '';
    for (let x = 0; x < span; x += 1) {
      const top = dark(x, y);
      const bottom = y + 1 < span ? dark(x, y + 1) : false;
      // In colour, the glyph is the dark part; without, the light part.
      const [upper, lower] = options.color ? [top, bottom] : [!top, !bottom];
      line += upper && lower ? '█' : upper ? '▀' : lower ? '▄' : ' ';
    }
    lines.push(options.color ? `\u001b[30;47m${line}\u001b[39;49m` : line);
  }
  return lines.join('\n');
}
