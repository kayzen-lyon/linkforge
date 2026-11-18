/**
 * Human-readable rendering. Pure functions: strings in, strings out.
 *
 * Everything that comes from a remote page goes through `clean()` first: a
 * title is free to contain an escape sequence, and a terminal would obey it.
 */
import type { ExtractData, LinkMetadata, OmnillinkError, OmnillinkResult, ReadableContent, ResponseMeta } from '@omnillink/sdk';

export interface Style {
  readonly enabled: boolean;
  bold(text: string): string;
  dim(text: string): string;
  red(text: string): string;
  green(text: string): string;
  yellow(text: string): string;
  cyan(text: string): string;
}

export function createStyle(enabled: boolean): Style {
  const wrap =
    (open: number, close: number) =>
    (text: string): string =>
      enabled && text !== '' ? `\u001b[${open}m${text}\u001b[${close}m` : text;
  return {
    enabled,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
  };
}

export interface ColorEnvironment {
  /** `--color` / `--no-color`, when given. */
  readonly flag: boolean | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly isTTY: boolean;
}

/** The flag wins, then NO_COLOR (https://no-color.org), then FORCE_COLOR, then the terminal. */
export function shouldUseColor({ flag, env, isTTY }: ColorEnvironment): boolean {
  if (flag !== undefined) return flag;
  if (env['NO_COLOR'] !== undefined && env['NO_COLOR'] !== '') return false;
  const force = env['FORCE_COLOR'];
  if (force !== undefined && force !== '') return force !== '0' && force !== 'false';
  return isTTY && env['TERM'] !== 'dumb';
}

// C0 and C1 controls (ESC and CSI among them), DEL, and the bidirectional
// overrides that can reorder what is displayed.
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;

/** One safe line: controls removed, whitespace collapsed. */
export function clean(value: string): string {
  return value.replace(CONTROLS, '').replace(/\s+/g, ' ').trim();
}

/** A safe block: controls removed, line breaks and tabs kept. */
export function cleanBlock(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(CONTROLS, '');
}

export function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function footer(meta: ResponseMeta | undefined, style: Style): string {
  if (meta === undefined || meta === null) return '';
  const parts = [meta.source, `${Math.round(meta.durationMs)} ms`, meta.cached ? 'cached' : 'fresh'];
  return style.dim(`  ${parts.join(' · ')}`);
}

export function rows(pairs: readonly (readonly [string, string | null | undefined])[], style: Style): string[] {
  const kept = pairs.filter((pair): pair is readonly [string, string] => typeof pair[1] === 'string' && pair[1] !== '');
  const width = Math.max(0, ...kept.map(([label]) => label.length));
  return kept.map(([label, value]) => `  ${style.dim(label.padEnd(width))}  ${value}`);
}

export function formatMeta(result: OmnillinkResult<LinkMetadata>, style: Style): string {
  const { data } = result;
  const title = data.title === null ? null : clean(data.title);
  const description = data.description === null ? null : truncate(clean(data.description), 280);
  const image =
    data.image === null
      ? null
      : clean(data.image.url) +
        (data.image.width !== null && data.image.height !== null
          ? style.dim(` (${data.image.width}×${data.image.height})`)
          : '');
  const date = data.date === null ? null : clean(data.date).slice(0, 10);
  const canonical = data.canonicalUrl !== null && data.canonicalUrl !== data.url ? clean(data.canonicalUrl) : null;
  // Fields added after the first release: an older instance does not send them.
  const twitter = [data.twitter?.card, data.twitter?.site].filter((part): part is string => typeof part === 'string').map(clean).join(' · ');

  return [
    style.bold(title ?? style.dim('(no title)')),
    `  ${style.cyan(clean(data.url))}`,
    ...(description === null || description === '' ? [] : [`  ${description}`]),
    '',
    ...rows(
      [
        ['Publisher', data.publisher === null ? null : clean(data.publisher)],
        ['Author', data.author === null ? null : clean(data.author)],
        ['Date', date],
        ['Modified', typeof data.dateModified === 'string' ? clean(data.dateModified).slice(0, 10) : null],
        ['Kind', typeof data.type === 'string' ? clean(data.type) : null],
        ['Language', data.lang === null ? null : clean(data.lang)],
        ['Translations', Array.isArray(data.alternates) && data.alternates.length > 0 ? truncate(data.alternates.map((item) => clean(item.lang)).join(', '), 120) : null],
        ['Canonical', canonical],
        ['Image', image],
        ['Favicon', data.favicon === null ? null : clean(data.favicon)],
        ['Logo', data.logo === null ? null : clean(data.logo.url)],
        ['Video', data.video === null ? null : clean(data.video.url)],
        ['Audio', data.audio === null ? null : clean(data.audio.url)],
        ['Feeds', data.feeds.length === 0 ? null : data.feeds.map((feed) => clean(feed.url)).join(', ')],
        ['Keywords', data.keywords.length === 0 ? null : truncate(data.keywords.map(clean).join(', '), 120)],
        ['Twitter', twitter === '' ? null : twitter],
        ['Theme', typeof data.themeColor === 'string' ? clean(data.themeColor) : null],
        ['Robots', typeof data.robots === 'string' ? clean(data.robots) : null],
        ['Paywall', data.paywalled === true ? 'yes' : data.paywalled === false ? 'no' : null],
        ['oEmbed', typeof data.oembed === 'string' ? clean(data.oembed) : null],
        ['Type', data.contentType === null ? null : clean(data.contentType)],
      ],
      style,
    ),
    footer(result.meta, style),
  ]
    .filter((line, index, lines) => !(line === '' && lines[index - 1] === ''))
    .join('\n');
}

export function scalar(value: unknown, style: Style): string {
  if (value === null || value === undefined) return style.dim('—');
  if (typeof value === 'number') return style.yellow(String(value));
  return truncate(clean(String(value)), 200);
}

export function formatExtract(result: OmnillinkResult<ExtractData>, style: Style): string {
  const entries = Object.entries(result.data.fields as Record<string, unknown>);
  const width = Math.max(0, ...entries.map(([name]) => clean(name).length));
  const lines = entries.flatMap(([name, value]) => {
    const label = `  ${style.dim(clean(name).padEnd(width))}  `;
    if (!Array.isArray(value)) return [`${label}${scalar(value, style)}`];
    const indent = ' '.repeat(width + 4);
    const shown = value.slice(0, 20).map((item) => `${indent}${style.dim('-')} ${scalar(item, style)}`);
    const more = value.length > 20 ? [`${indent}${style.dim(`… ${value.length - 20} more (use --json for all)`)}`] : [];
    return [`${label}${style.dim(`${value.length} ${value.length === 1 ? 'match' : 'matches'}`)}`, ...shown, ...more];
  });
  return [style.cyan(clean(result.data.url)), ...lines, footer(result.meta, style)].join('\n');
}

/** The body of `content`: the document itself, with nothing around it. */
export function formatContentBody(result: OmnillinkResult<ReadableContent>, asText: boolean): string {
  return cleanBlock(asText ? result.data.text : result.data.markdown).trimEnd();
}

/** One line about a `content` answer, shown on standard error next to the body. */
export function formatContentSummary(result: OmnillinkResult<ReadableContent>, style: Style): string {
  const { data } = result;
  const words = `${data.wordCount} ${data.wordCount === 1 ? 'word' : 'words'}`;
  const title = data.title === null ? '(no title)' : truncate(clean(data.title), 80);
  return style.dim(`${title} · ${words} · ${data.readingTimeMinutes} min read · ${clean(data.url)}`);
}

export function formatSaved(file: string, type: string, bytes: number, url: string, style: Style): string {
  return `${style.green('✓')} ${style.bold(file)}  ${style.dim(`${type || 'unknown type'}, ${formatBytes(bytes)}`)}  ${style.dim(clean(url))}`;
}

const ADVICE: Readonly<Record<string, string>> = {
  EUNAUTHORIZED: 'Check OMNILLINK_API_KEY: the instance does not know this key.',
  ERATELIMIT: 'The quota of the current window is used up.',
  EFORBIDDENURL: 'The instance refuses private and internal addresses.',
  EBLOCKED: 'The site served an anti-bot page instead of its content; retrying rarely helps.',
  ECIRCUITOPEN: 'This host failed several times in a row and is skipped for a moment; try again shortly.',
  EBUSY: 'The rendering pool is full; try again in a few seconds, or lower --concurrency.',
  EEMBEDNOTFOUND: 'The page does not have what was asked for (preview image, icon, oEmbed link, table).',
  ENOTHTML: 'The URL is not an HTML page.',
  ENETWORK: 'Check --base-url / OMNILLINK_URL and your connection.',
  ETIMEOUT: 'Raise --timeout, or try again: slow pages are cached once rendered.',
  EHTTP: 'Is --base-url the origin of an Omnillink instance?',
  EBADRESPONSE: 'Is --base-url the origin of an Omnillink instance?',
};

export function formatError(error: OmnillinkError, url: string | undefined, style: Style): string {
  const status = error.status > 0 ? ` (HTTP ${error.status})` : '';
  const target = url === undefined ? '' : ` ${style.dim(truncate(clean(url), 120))}`;
  const retry = error.retryAfter === undefined ? '' : ` Retry in ${error.retryAfter} s.`;
  const advice = ADVICE[error.code];
  return [
    `${style.red('✗')} ${style.bold(clean(error.code))}${status}${target}`,
    `  ${clean(error.message)}${retry}`,
    ...(advice === undefined ? [] : [style.dim(`  ${advice}`)]),
  ].join('\n');
}

export function formatUsageError(message: string, hint: string | undefined, command: string | undefined, style: Style): string {
  const help = command === undefined ? 'omnillink --help' : `omnillink ${command} --help`;
  return [
    `${style.red('error:')} ${message}`,
    ...(hint === undefined ? [] : [`  ${hint}`]),
    style.dim(`  See \`${help}\`.`),
  ].join('\n');
}
