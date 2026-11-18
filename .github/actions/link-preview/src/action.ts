/**
 * Omnillink link-preview action.
 *
 * No dependency besides the SDK, which is bundled into `dist/index.mjs`: the
 * few lines of the Actions toolkit this needs (inputs, outputs, summary) are
 * written here against the documented file-based protocol.
 *
 * Two kinds of text flow through this file and neither is trusted:
 * - the inputs (a URL can come from an issue or a pull request body), which
 *   are only ever passed as data to the SDK, never to a shell;
 * - the metadata of the page, which is escaped before it reaches the summary
 *   and never printed to the log, where a line starting with `::` is a command.
 */
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, isOmnillinkError, type LinkCheck, type LinkMetadata, type OmnillinkClient, type ResponseMeta } from '@omnillink/sdk';

type Env = Readonly<Record<string, string | undefined>>;

export class InputError extends Error {
  override readonly name = 'InputError';
}

// ---- Actions protocol ---------------------------------------------------------

/** `base-url` → `INPUT_BASE-URL`, as the runner exports it. */
export function getInput(env: Env, name: string): string {
  return (env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '').trim();
}

/** `fallback` mirrors the default of action.yml, for a caller that bypasses it. */
function getBoolean(env: Env, name: string, fallback: boolean): boolean {
  const value = getInput(env, name).toLowerCase();
  if (value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new InputError(`Input "${name}" must be "true" or "false"`);
}

function getChoice<T extends string>(env: Env, name: string, choices: readonly T[], fallback: T): T {
  const value = getInput(env, name);
  if (value === '') return fallback;
  const match = choices.find((choice) => choice === value);
  if (match === undefined) throw new InputError(`Input "${name}" must be one of: ${choices.join(', ')}`);
  return match;
}

/** Escapes the data of a workflow command (`::error::<data>`). */
export const escapeData = (value: string): string =>
  value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** `name<<delimiter` form of the output file, safe for any value. */
export function outputRecord(name: string, value: string): string {
  let delimiter = `ghadelimiter_${randomUUID()}`;
  while (value.includes(delimiter)) delimiter = `ghadelimiter_${randomUUID()}`;
  return `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
}

// ---- summary ------------------------------------------------------------------

/**
 * Text for the job summary. The summary is Markdown that allows HTML: both
 * syntaxes are neutralised with character references, which render as the
 * literal character and are never parsed as markup.
 */
export function escapeText(value: string, max = 500): string {
  const flat = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return cut.replace(/[&<>"'`*_~[\](){}#|\\@!:+=-]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The URL, normalised and attribute-safe, if it is absolute http(s) without credentials. */
export function safeUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '') return null;
    return url.href.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  } catch {
    return null;
  }
}

function link(value: string | null | undefined): string | null {
  const href = safeUrl(value);
  return href === null ? null : `<a href="${href}">${escapeText(value ?? '', 120)}</a>`;
}

export interface SummaryInput {
  readonly url: string;
  readonly data: LinkMetadata;
  readonly meta: ResponseMeta | undefined;
  /** Public URL of the screenshot endpoint, when it can be embedded. */
  readonly screenshotUrl: string | null;
  readonly screenshotPath: string | null;
  readonly screenshotError: string | null;
}

export function renderSummary({ url, data, meta, screenshotUrl, screenshotPath, screenshotError }: SummaryInput): string {
  const row = (label: string, value: string | null): string => (value === null || value === '' ? '' : `<tr><th align="left">${label}</th><td>${value}</td></tr>\n`);
  const text = (value: string | null | undefined, max?: number): string | null =>
    typeof value === 'string' && value.trim() !== '' ? escapeText(value, max) : null;
  const image = safeUrl(data.image?.url);
  const shot = safeUrl(screenshotUrl);
  const provenance = meta === undefined || meta === null ? '' : ` · ${escapeText(String(meta.source))}${meta.cached === true ? ', cached' : ''}`;

  // One HTML block, without a blank line: nothing in it is parsed as Markdown.
  return [
    `<h3>🔗 ${text(data.title, 200) ?? 'Link preview'}</h3>\n`,
    text(data.description) === null ? '' : `<p>${text(data.description)}</p>\n`,
    image === null ? '' : `<p><img src="${image}" alt="" width="480"></p>\n`,
    '<table>\n',
    row('URL', link(url)),
    row('Canonical', data.canonicalUrl !== null && data.canonicalUrl !== url ? link(data.canonicalUrl) : null),
    row('Publisher', text(data.publisher, 120)),
    row('Author', text(data.author, 120)),
    row('Date', text(data.date, 40)),
    row('Modified', text(data.dateModified, 40)),
    row('Language', text(data.lang, 20)),
    row('Type', text(data.contentType, 80)),
    row('Feeds', data.feeds.length === 0 ? null : String(data.feeds.length)),
    '</table>\n',
    shot === null ? '' : `<details><summary>Screenshot</summary>\n<p><img src="${shot}" alt="Screenshot of the page" width="720"></p>\n</details>\n`,
    shot === null && screenshotPath !== null
      ? `<p>Screenshot saved on the runner as <code>${escapeText(screenshotPath, 300)}</code>: upload it with <code>actions/upload-artifact</code> to keep it.</p>\n`
      : '',
    screenshotError === null ? '' : `<p>⚠️ No screenshot: ${escapeText(screenshotError, 300)}</p>\n`,
    `<p><sub>Omnillink${provenance}</sub></p>\n`,
  ].join('');
}

export function renderFailure(url: string, code: string, message: string): string {
  return `<h3>🔗 Link preview unavailable</h3>\n<p><code>${escapeText(code, 40)}</code> — ${escapeText(message, 300)}</p>\n<p>${link(url) ?? escapeText(url, 200)}</p>\n`;
}

// ---- check-links --------------------------------------------------------------

/** Most URLs one step checks: a summary is a page, not a crawl. */
export const MAX_CHECKED_URLS = 100;
const CHECK_CONCURRENCY = 4;

/** One URL per line (or separated by spaces or commas); blank lines and `#` comments are skipped. */
export function parseUrlList(value: string): string[] {
  const urls = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .flatMap((line) => line.split(/[\s,]+/))
    .filter((item) => item !== '');
  return [...new Set(urls)];
}

export type CheckedLink =
  | { readonly url: string; readonly ok: boolean; readonly check: LinkCheck; readonly error?: undefined }
  /** The check itself could not be made (refused address, unreachable host, quota…). */
  | { readonly url: string; readonly ok: false; readonly check?: undefined; readonly error: { readonly code: string; readonly message: string } };

/** Runs `worker` over `items`, `limit` at a time, keeping the order of the input. */
async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    for (let index = next++; index < items.length; index = next++) results[index] = await worker(items[index] as T);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

export function renderCheckSummary(links: readonly CheckedLink[]): string {
  const broken = links.filter((item) => !item.ok).length;
  const rows = links
    .map((item) => {
      if (item.check === undefined) {
        return `<tr><td>⚠️</td><td>${link(item.url) ?? escapeText(item.url, 120)}</td><td><code>${escapeText(item.error.code, 40)}</code></td><td colspan="3">${escapeText(item.error.message, 200)}</td></tr>\n`;
      }
      const { check } = item;
      const hops = check.redirects.length - 1;
      const final = check.finalUrl !== check.url ? (link(check.finalUrl) ?? escapeText(check.finalUrl, 120)) : '';
      const tls = check.tls === null ? '' : `${check.tls.daysLeft}&#32;d`;
      return `<tr><td>${check.ok ? '✅' : '❌'}</td><td>${link(item.url) ?? escapeText(item.url, 120)}</td><td>${check.status}</td><td>${hops === 0 ? '' : hops}</td><td>${final}</td><td>${tls}</td></tr>\n`;
    })
    .join('');
  // One HTML block, without a blank line: nothing in it is parsed as Markdown.
  return [
    `<h3>🔗 Link check: ${broken === 0 ? `${links.length} link(s), all working` : `${broken} of ${links.length} link(s) broken`}</h3>\n`,
    '<table>\n<tr><th></th><th align="left">URL</th><th>Status</th><th>Redirects</th><th align="left">Final URL</th><th>Certificate</th></tr>\n',
    rows,
    '</table>\n',
    '<p><sub>Omnillink · checked just now, bodies not downloaded</sub></p>\n',
  ].join('');
}

// ---- main ---------------------------------------------------------------------

/** `example.com-blog-1a2b3c4d.png`: a plain file name whatever the URL contains. */
export function screenshotName(url: string, extension: string): string {
  let readable = 'page';
  try {
    const parsed = new URL(url);
    readable = `${parsed.hostname}${parsed.pathname}`;
  } catch {
    // Validated before; the name only has to be safe.
  }
  const slug = readable
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
    .replace(/[-.]+$/g, '');
  return `${slug === '' ? 'page' : slug}-${randomUUID().slice(0, 8)}.${extension}`;
}

const MAX_METADATA_OUTPUT = 512_000;

export interface Io {
  readonly env: Env;
  log(line: string): void;
  readonly fetch?: typeof fetch;
}

/** Runs the action and resolves to the exit code of the step. */
export async function run(io: Io): Promise<number> {
  const { env, log } = io;
  const outputs: Record<string, string> = {
    ok: 'false',
    'error-code': '',
    title: '',
    description: '',
    image: '',
    'canonical-url': '',
    publisher: '',
    metadata: '',
    'screenshot-path': '',
    'checked-count': '',
    'broken-count': '',
    results: '',
  };
  let summary = '';
  let wantSummary = true;
  let failOnError = true;
  let exitCode = 0;

  const apiKey = getInput(env, 'api-key');
  // Registered before anything else can be printed.
  if (apiKey !== '') log(`::add-mask::${escapeData(apiKey)}`);
  const redact = (value: string): string => (apiKey.length >= 4 ? value.replaceAll(apiKey, '***') : value);

  let url = '';
  try {
    url = getInput(env, 'url');
    wantSummary = getBoolean(env, 'summary', true);
    failOnError = getBoolean(env, 'fail-on-error', true);
    const mode = getChoice(env, 'mode', ['preview', 'check-links'] as const, 'preview');
    const baseUrl = getInput(env, 'base-url');
    const urls = mode === 'check-links' ? parseUrlList(`${getInput(env, 'urls')}\n${url}`) : [];
    if (mode === 'check-links') {
      if (urls.length === 0) throw new InputError('Mode "check-links" needs the input "urls": one URL per line');
      if (urls.length > MAX_CHECKED_URLS) throw new InputError(`Input "urls" lists ${urls.length} URLs: at most ${MAX_CHECKED_URLS} per step`);
      const bad = urls.find((item) => safeUrl(item) === null);
      if (bad !== undefined) {
        url = bad;
        throw new InputError('Input "urls" must only list absolute http(s) URLs');
      }
    } else if (safeUrl(url) === null) {
      throw new InputError('Input "url" must be an absolute http(s) URL');
    }
    if (safeUrl(baseUrl) === null) throw new InputError('Input "base-url" must be an absolute http(s) URL, without credentials');
    const render = getChoice(env, 'render', ['auto', 'never', 'always'] as const, 'auto');
    const wantScreenshot = getBoolean(env, 'screenshot', false);
    const device = getChoice(env, 'device', ['desktop', 'mobile'] as const, 'desktop');
    const fullPage = getBoolean(env, 'full-page', false);
    const timeoutMs = Number(getInput(env, 'timeout-ms') || '60000');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0) throw new InputError('Input "timeout-ms" must be a non-negative integer');

    const client: OmnillinkClient = createClient({
      baseUrl,
      timeoutMs,
      ...(apiKey === '' ? {} : { apiKey }),
      ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    });

    if (mode === 'check-links') {
      log(`Checking ${urls.length} link(s)`);
      const links = await mapLimit(urls, CHECK_CONCURRENCY, async (target): Promise<CheckedLink> => {
        try {
          const { data } = await client.check(target);
          return { url: target, ok: data.ok, check: data };
        } catch (error) {
          const code = isOmnillinkError(error) ? String(error.code) : 'EFAILED';
          return { url: target, ok: false, error: { code, message: redact(error instanceof Error ? error.message : String(error)) } };
        }
      });
      const broken = links.filter((item) => !item.ok);
      const results = links.map((item) =>
        item.check === undefined
          ? { url: item.url, ok: false, status: null, finalUrl: null, redirects: null, error: item.error.code }
          : { url: item.url, ok: item.ok, status: item.check.status, finalUrl: item.check.finalUrl, redirects: item.check.redirects.length - 1, error: null },
      );
      Object.assign(outputs, {
        ok: String(broken.length === 0),
        'error-code': broken.length === 0 ? '' : (broken.find((item) => item.error !== undefined)?.error?.code ?? 'EBROKENLINK'),
        'checked-count': String(links.length),
        'broken-count': String(broken.length),
        results: JSON.stringify(results),
      });
      summary = renderCheckSummary(links);
      if (broken.length > 0) {
        // Counts only: the URLs came from the workflow, but they are data, and the log obeys `::` lines.
        const level = failOnError ? 'error' : 'warning';
        log(`::${level} title=Omnillink link check::${escapeData(`${broken.length} of ${links.length} link(s) broken or unreachable; see the job summary`)}`);
        if (failOnError) exitCode = 1;
      }
      log('Done');
    } else {
      await preview();
    }

    async function preview(): Promise<void> {

      log(`Fetching the metadata of ${escapeData(url)}`);
      const { data, meta } = await client.meta(url, { render });

      let screenshotPath: string | null = null;
      let screenshotError: string | null = null;
      const shotOptions = { device, fullPage } as const;
      if (wantScreenshot) {
        log('Taking a screenshot');
        try {
          const blob = await client.screenshot(url, shotOptions);
          const directory = join(env['RUNNER_TEMP'] ?? tmpdir(), 'omnillink-link-preview');
          await mkdir(directory, { recursive: true });
          screenshotPath = join(directory, screenshotName(url, blob.type === 'image/jpeg' ? 'jpg' : 'png'));
          await writeFile(screenshotPath, Buffer.from(await blob.arrayBuffer()));
          log(`Screenshot saved (${blob.size} bytes)`);
        } catch (error) {
          // The metadata is the point of the action: a missing screenshot is a warning.
          screenshotError = isOmnillinkError(error) ? `${error.code}: ${redact(error.message)}` : 'the image could not be saved';
          log(`::warning title=Omnillink::${escapeData(`No screenshot: ${screenshotError}`)}`);
        }
      }

      let metadata = JSON.stringify(data);
      if (metadata.length > MAX_METADATA_OUTPUT) metadata = JSON.stringify({ ...data, jsonLd: [] });
      Object.assign(outputs, {
        ok: 'true',
        title: data.title ?? '',
        description: data.description ?? '',
        image: data.image?.url ?? '',
        'canonical-url': data.canonicalUrl ?? data.url ?? '',
        publisher: data.publisher ?? '',
        metadata: metadata.length > MAX_METADATA_OUTPUT ? '' : metadata,
        'screenshot-path': screenshotPath ?? '',
      });
      summary = renderSummary({
        url,
        data,
        meta,
        // The summary is rendered by browsers that cannot send the key: only an
        // anonymous instance can serve the image directly. The key is never in this URL.
        screenshotUrl: screenshotPath !== null && apiKey === '' ? client.screenshotUrl(url, shotOptions) : null,
        screenshotPath,
        screenshotError,
      });
      log('Done');
    }
  } catch (error) {
    const code = error instanceof InputError ? 'EINPUT' : isOmnillinkError(error) ? String(error.code) : 'EFAILED';
    const message = redact(error instanceof Error ? error.message : String(error));
    outputs['error-code'] = code;
    summary = renderFailure(url, code, message);
    const level = failOnError || error instanceof InputError ? 'error' : 'warning';
    log(`::${level} title=Omnillink ${escapeData(code).replace(/[,:]/g, ' ')}::${escapeData(message)}`);
    if (level === 'error') exitCode = 1;
  }

  const outputFile = env['GITHUB_OUTPUT'];
  if (outputFile !== undefined && outputFile !== '') {
    await appendFile(outputFile, Object.entries(outputs).map(([name, value]) => outputRecord(name, value)).join(''));
  }
  const summaryFile = env['GITHUB_STEP_SUMMARY'];
  if (wantSummary && summaryFile !== undefined && summaryFile !== '') {
    await appendFile(summaryFile, `${summary}\n`);
  }
  return exitCode;
}
