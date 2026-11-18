/**
 * The whole CLI as one function of its inputs and outputs, so tests can drive
 * it without a child process: `run(io)` resolves to the exit code.
 */
import { mkdir, open, writeFile, type FileHandle } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';

import {
  createClient,
  isOmnillinkError,
  OmnillinkError,
  type ExtractData,
  type ExtractField,
  type LinkMetadata,
  type OmnillinkClient,
  type OmnillinkResult,
  type ReadableContent,
  type RequestOptions,
} from '@omnillink/sdk';

import { closest, parseArgs, splitCommand, UsageError, type FlagValue } from './args.js';
import { mapOrdered, readUrlLines } from './batch.js';
import {
  ALIASES,
  COMMANDS,
  commandHelp,
  DEFAULT_BASE_URL,
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  EXIT,
  findCommand,
  GLOBAL_FLAGS,
  mainHelp,
  type CommandSpec,
} from './commands.js';
import { extensionFor, fileNameFor, resolveInside } from './files.js';
import {
  createStyle,
  formatContentBody,
  formatContentSummary,
  formatError,
  formatExtract,
  formatMeta,
  formatSaved,
  formatUsageError,
  shouldUseColor,
  type Style,
} from './format.js';

export interface Io {
  /** Arguments after the program name (`process.argv.slice(2)`). */
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdin: Readable & { readonly isTTY?: boolean };
  readonly stdout: Writable & { readonly isTTY?: boolean };
  readonly stderr: Writable & { readonly isTTY?: boolean };
  /** Directory relative paths are resolved against. Defaults to the process's. */
  readonly cwd?: string;
  /** Aborting it cancels the requests in flight (Ctrl+C). */
  readonly signal?: AbortSignal;
  /** `fetch` handed to the SDK; the global one by default. */
  readonly fetch?: typeof fetch;
}

/** One line of `--json` output. */
export type OutputRecord =
  | { readonly url: string; readonly ok: true; readonly data: unknown; readonly meta: unknown }
  | { readonly url: string; readonly ok: true; readonly file: string | null; readonly bytes: number; readonly type: string }
  | {
      readonly url: string;
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly status: number;
        readonly message: string;
        readonly retryable: boolean;
        readonly retryAfter?: number;
      };
    };

export function readVersion(): string {
  try {
    const manifest = createRequire(import.meta.url)('../package.json') as { version?: unknown };
    return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function write(stream: Writable, chunk: string | Uint8Array): Promise<void> {
  return new Promise((done, fail) => {
    stream.write(chunk, (error) => (error ? fail(error) : done()));
  });
}

const camel = (name: string): string => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Flags that steer the CLI itself and are not parameters of the endpoint. */
const LOCAL_FLAGS = new Set(['output-dir', 'field', 'fields', 'text']);

function endpointOptions(command: CommandSpec, flags: ReadonlyMap<string, FlagValue>): Record<string, FlagValue> {
  const options: Record<string, FlagValue> = {};
  for (const spec of command.flags) {
    const value = flags.get(spec.name);
    if (value !== undefined && !LOCAL_FLAGS.has(spec.name)) options[camel(spec.name)] = value;
  }
  return options;
}

const FIELD_NAME = /^([A-Za-z0-9_.-]{1,64}?)(?:@([A-Za-z0-9_.-]+))?(?::(string|number|url))?(\[\])?$/;
const FIELD_SYNTAX = 'A rule is NAME[@ATTR][:TYPE][[]]=SELECTOR, for example: -f \'links@href:url[]=a\'';

/** `links@href:url[]=nav a` → `['links', { selector: 'nav a', attr: 'href', type: 'url', all: true }]`. */
export function parseFieldRule(rule: string): readonly [string, ExtractField] {
  const equals = rule.indexOf('=');
  if (equals <= 0) throw new UsageError(`Invalid --field ${JSON.stringify(rule)}: missing NAME=`, FIELD_SYNTAX);
  const selector = rule.slice(equals + 1).trim();
  if (selector === '') throw new UsageError(`Invalid --field ${JSON.stringify(rule)}: the selector is empty`, FIELD_SYNTAX);
  const match = FIELD_NAME.exec(rule.slice(0, equals).trim());
  if (match === null) {
    throw new UsageError(`Invalid --field ${JSON.stringify(rule)}: cannot read the part before "="`, FIELD_SYNTAX);
  }
  const [, name = '', attr, type, all] = match;
  return [
    name,
    {
      selector,
      ...(attr === undefined ? {} : { attr }),
      ...(type === undefined ? {} : { type: type as 'string' | 'number' | 'url' }),
      ...(all === undefined ? {} : { all: true }),
    },
  ];
}

export function buildFields(flags: ReadonlyMap<string, FlagValue>): Record<string, ExtractField> {
  const fields: Record<string, ExtractField> = Object.create(null) as Record<string, ExtractField>;
  const json = flags.get('fields');
  if (typeof json === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new UsageError(`--fields is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new UsageError('--fields must be a JSON object of rules: {"name":{"selector":"h1"}}');
    }
    for (const [name, rule] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof rule !== 'object' || rule === null || typeof (rule as { selector?: unknown }).selector !== 'string') {
        throw new UsageError(`--fields: the rule ${JSON.stringify(name)} needs a "selector" string`);
      }
      fields[name] = rule as ExtractField;
    }
  }
  const rules = flags.get('field');
  for (const rule of Array.isArray(rules) ? (rules as readonly string[]) : []) {
    const [name, field] = parseFieldRule(rule);
    if (name in fields) throw new UsageError(`The field ${JSON.stringify(name)} is defined twice`);
    fields[name] = field;
  }
  if (Object.keys(fields).length === 0) {
    throw new UsageError('extract needs at least one rule', `${FIELD_SYNTAX}, or --fields '<json>'.`);
  }
  return { ...fields };
}

interface Connection {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
}

export function resolveConnection(flags: ReadonlyMap<string, FlagValue>, env: Io['env']): Connection {
  const flagUrl = flags.get('base-url');
  const envUrl = env['OMNILLINK_URL']?.trim();
  const explicit = typeof flagUrl === 'string' ? flagUrl : envUrl !== undefined && envUrl !== '' ? envUrl : undefined;
  const source = typeof flagUrl === 'string' ? '--base-url' : 'OMNILLINK_URL';

  const flagKey = flags.get('api-key');
  const envKey = env['OMNILLINK_API_KEY'];
  const apiKey = typeof flagKey === 'string' ? flagKey : envKey !== undefined && envKey !== '' ? envKey : undefined;

  if (explicit === undefined) {
    if (apiKey !== undefined) {
      // A key belongs to one instance: never send it to the public default by accident.
      throw new UsageError(
        'An API key is set but the instance is not',
        'Say which instance the key is for with --base-url or OMNILLINK_URL.',
      );
    }
    return { baseUrl: DEFAULT_BASE_URL, apiKey: undefined };
  }

  let parsed: URL;
  try {
    parsed = new URL(explicit);
  } catch {
    throw new UsageError(`${source} is not a URL`, 'Expected the origin of an Omnillink instance, e.g. https://links.example.com');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UsageError(`${source} must start with http:// or https://`);
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new UsageError(`${source} must not contain credentials`, 'Pass the key with OMNILLINK_API_KEY instead.');
  }
  return { baseUrl: explicit, apiKey };
}

/** Checks a URL typed on the command line, before anything is sent. */
function assertTargetUrl(url: string): void {
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    parsed = undefined;
  }
  if (parsed !== undefined && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return;
  const bare = /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(url);
  throw new UsageError(
    `${JSON.stringify(url)} is not an absolute http(s) URL`,
    bare ? `Did you mean https://${url}?` : undefined,
  );
}

type Outcome =
  | { readonly kind: 'ok'; readonly record: OutputRecord; readonly human: string; readonly note?: string }
  | { readonly kind: 'binary-stdout'; readonly record: OutputRecord; readonly bytes: Uint8Array }
  | { readonly kind: 'error'; readonly record: OutputRecord; readonly human: string; readonly exit: number };

function exitCodeFor(error: OmnillinkError): number {
  return error.status === 0 ? EXIT.network : EXIT.api;
}

export async function run(io: Io): Promise<number> {
  const stderrStyle = createStyle(shouldUseColor({ flag: undefined, env: io.env, isTTY: io.stderr.isTTY === true }));
  let commandName: string | undefined;
  try {
    return await main(io, (name) => {
      commandName = name;
    });
  } catch (error) {
    if (error instanceof UsageError) {
      await write(io.stderr, `${formatUsageError(error.message, error.hint, commandName, stderrStyle)}\n`);
      return EXIT.usage;
    }
    // The reader of our output went away (`| head`): not an error.
    if ((error as NodeJS.ErrnoException | null)?.code === 'EPIPE') return EXIT.ok;
    const message = error instanceof Error ? error.message : String(error);
    await write(io.stderr, `${stderrStyle.red('error:')} ${message}\n`).catch(() => undefined);
    return EXIT.failure;
  }
}

async function main(io: Io, setCommand: (name: string) => void): Promise<number> {
  const version = readVersion();
  const { command: rawCommand, rest } = splitCommand(io.argv, GLOBAL_FLAGS);

  if (rawCommand === undefined || rawCommand === 'help') {
    const { flags, positionals } = parseArgs(rest, GLOBAL_FLAGS, COMMANDS.map((c) => ({ command: c.name, specs: c.flags })));
    if (flags.get('version') === true) {
      await write(io.stdout, `${version}\n`);
      return EXIT.ok;
    }
    const topic = rawCommand === 'help' ? positionals[0] : undefined;
    const about = topic === undefined ? undefined : findCommand(ALIASES[topic] ?? topic);
    if (rawCommand === 'help' || flags.get('help') === true) {
      await write(io.stdout, `${about === undefined ? mainHelp(version) : commandHelp(about)}\n`);
      return EXIT.ok;
    }
    await write(io.stderr, `${mainHelp(version)}\n`);
    return EXIT.usage;
  }

  const command = findCommand(ALIASES[rawCommand] ?? rawCommand);
  if (command === undefined) {
    const suggestion = closest(rawCommand, COMMANDS.map((c) => c.name));
    const looksLikeUrl = /^https?:\/\//i.test(rawCommand);
    throw new UsageError(
      looksLikeUrl ? 'Missing command before the URL' : `Unknown command ${JSON.stringify(rawCommand)}`,
      looksLikeUrl
        ? `Try: omnillink meta ${rawCommand}`
        : suggestion === undefined
          ? `Commands: ${COMMANDS.map((c) => c.name).join(', ')}.`
          : `Did you mean \`omnillink ${suggestion}\`?`,
    );
  }
  setCommand(command.name);

  const foreign = COMMANDS.filter((other) => other !== command).map((other) => ({ command: other.name, specs: other.flags }));
  const { flags, positionals } = parseArgs(rest, [...GLOBAL_FLAGS, ...command.flags], foreign);

  if (flags.get('help') === true) {
    await write(io.stdout, `${commandHelp(command)}\n`);
    return EXIT.ok;
  }
  if (flags.get('version') === true) {
    await write(io.stdout, `${version}\n`);
    return EXIT.ok;
  }

  // ---- everything below is validated before the first request ------------

  const colorFlag = flags.get('color');
  const colorChoice = typeof colorFlag === 'boolean' ? colorFlag : undefined;
  const out = createStyle(shouldUseColor({ flag: colorChoice, env: io.env, isTTY: io.stdout.isTTY === true }));
  const err = createStyle(shouldUseColor({ flag: colorChoice, env: io.env, isTTY: io.stderr.isTTY === true }));

  const connection = resolveConnection(flags, io.env);
  const json = flags.get('json') === true;
  const cwd = io.cwd ?? process.cwd();
  const timeoutMs = (flags.get('timeout') as number | undefined) ?? DEFAULT_TIMEOUT_MS;
  const concurrency = (flags.get('concurrency') as number | undefined) ?? DEFAULT_CONCURRENCY;
  const options = endpointOptions(command, flags);
  const fields = command.name === 'extract' ? buildFields(flags) : undefined;
  const asText = flags.get('text') === true;

  const fromStdin = positionals.includes('-') || (positionals.length === 0 && io.stdin.isTTY !== true);
  if (positionals.includes('-') && positionals.length > 1) {
    throw new UsageError('"-" reads the URLs from standard input and cannot be mixed with URLs on the command line');
  }
  if (positionals.length === 0 && !fromStdin) {
    throw new UsageError('Missing URL', `Usage: omnillink ${command.name} <url>...   or pipe a list: omnillink ${command.name} < urls.txt`);
  }
  if (!fromStdin) positionals.forEach(assertTargetUrl);
  const many = fromStdin || positionals.length > 1;

  const outputFlag = flags.get('output');
  const outputDirFlag = flags.get('output-dir');
  const outputFile = typeof outputFlag === 'string' ? resolve(cwd, outputFlag) : undefined;
  const outputDir = typeof outputDirFlag === 'string' ? resolve(cwd, outputDirFlag) : undefined;
  let binaryToStdout = false;

  if (command.kind === 'binary') {
    if (outputFile !== undefined && outputDir !== undefined) {
      throw new UsageError('--output and --output-dir are mutually exclusive');
    }
    if (many && outputDir === undefined) {
      throw new UsageError(
        outputFile === undefined ? 'Several URLs need a directory to write to' : '--output names one file, but several URLs were given',
        'Use --output-dir <dir>: one file per URL, named after it.',
      );
    }
    if (outputFile === undefined && outputDir === undefined) {
      if (json) throw new UsageError('--json describes the file that was written: add --output <file> or --output-dir <dir>');
      if (io.stdout.isTTY === true) {
        const sample = command.name === 'pdf' ? 'page.pdf' : 'shot.png';
        throw new UsageError(
          'Refusing to write binary data to the terminal',
          `Use --output ${sample}, or redirect: omnillink ${command.name} <url> > ${sample}`,
        );
      }
      binaryToStdout = true;
    }
  }

  const redact = (text: string): string =>
    connection.apiKey !== undefined && connection.apiKey.length >= 4 ? text.replaceAll(connection.apiKey, '[redacted]') : text;

  const client: OmnillinkClient = createClient({
    baseUrl: connection.baseUrl,
    timeoutMs,
    ...(connection.apiKey === undefined ? {} : { apiKey: connection.apiKey }),
    ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
  });
  const request: RequestOptions = io.signal === undefined ? {} : { signal: io.signal };

  // Text results go to a file when --output is given to a text command.
  let textFile: FileHandle | undefined;
  if (command.kind === 'json' && outputFile !== undefined) textFile = await open(outputFile, 'w');
  if (outputDir !== undefined) await mkdir(outputDir, { recursive: true });
  const emitText = (text: string): Promise<unknown> => (textFile === undefined ? write(io.stdout, text) : textFile.write(text));

  const failed = (url: string, error: unknown): Outcome => {
    if (isOmnillinkError(error)) {
      const safe = new OmnillinkError({
        code: error.code,
        status: error.status,
        message: redact(error.message),
        ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
      });
      return {
        kind: 'error',
        exit: exitCodeFor(error),
        human: formatError(safe, many ? url : undefined, err),
        record: {
          url,
          ok: false,
          error: {
            code: safe.code,
            status: safe.status,
            message: safe.message,
            retryable: safe.retryable,
            ...(safe.retryAfter === undefined ? {} : { retryAfter: safe.retryAfter }),
          },
        },
      };
    }
    // Not from the API: a file that could not be written, or a bug.
    const local = error as NodeJS.ErrnoException;
    const message = redact(error instanceof Error ? error.message : String(error));
    return {
      kind: 'error',
      exit: EXIT.failure,
      human: `${err.red('✗')} ${message}`,
      record: { url, ok: false, error: { code: typeof local?.code === 'string' ? local.code : 'EFAILED', status: 0, message, retryable: false } },
    };
  };

  const work = async (url: string): Promise<Outcome> => {
    try {
      switch (command.name) {
        case 'meta': {
          const result: OmnillinkResult<LinkMetadata> = await client.meta(url, { ...options, ...request });
          return { kind: 'ok', record: { url, ok: true, ...result }, human: formatMeta(result, out) };
        }
        case 'extract': {
          const result = (await client.extract(url, fields ?? {}, { ...options, ...request })) as OmnillinkResult<ExtractData>;
          return { kind: 'ok', record: { url, ok: true, ...result }, human: formatExtract(result, out) };
        }
        case 'content': {
          const result: OmnillinkResult<ReadableContent> = await client.content(url, { ...options, ...request });
          const body = formatContentBody(result, asText);
          return {
            kind: 'ok',
            record: { url, ok: true, ...result },
            human: many ? `<!-- source: ${url.replaceAll('--', '%2D%2D')} -->\n\n${body}` : body,
            note: formatContentSummary(result, err),
          };
        }
        case 'shot':
        case 'pdf': {
          const blob = command.name === 'pdf' ? await client.pdf(url, { ...options, ...request }) : await client.screenshot(url, { ...options, ...request });
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (binaryToStdout) {
            return { kind: 'binary-stdout', bytes, record: { url, ok: true, file: null, bytes: bytes.byteLength, type: blob.type } };
          }
          const fallback = command.name === 'pdf' ? 'pdf' : options['format'] === 'jpeg' ? 'jpg' : 'png';
          const file =
            outputFile ?? resolveInside(outputDir ?? cwd, fileNameFor(url, extensionFor(blob.type, fallback)));
          await writeFile(file, bytes);
          return {
            kind: 'ok',
            record: { url, ok: true, file, bytes: bytes.byteLength, type: blob.type },
            human: formatSaved(file, blob.type, bytes.byteLength, url, out),
          };
        }
      }
    } catch (error) {
      return failed(url, error);
    }
  };

  let succeeded = 0;
  let failures = 0;
  let exit: number = EXIT.ok;
  // 1 (local failure) outranks 4 (network), which outranks 3 (API).
  const rank = (code: number): number => [EXIT.ok, EXIT.api, EXIT.network, EXIT.failure].indexOf(code as 0);
  let first = true;

  const emit = async (outcome: Outcome): Promise<void> => {
    if (outcome.kind === 'error') {
      failures += 1;
      if (rank(outcome.exit) > rank(exit)) exit = outcome.exit;
    } else {
      succeeded += 1;
    }

    if (outcome.kind === 'binary-stdout') {
      await write(io.stdout, outcome.bytes);
    } else if (json) {
      await emitText(`${JSON.stringify(outcome.record, null, many ? undefined : 2)}\n`);
    } else if (outcome.kind === 'error') {
      await write(io.stderr, `${outcome.human}\n`);
    } else {
      const separator = first || command.kind === 'binary' ? '' : '\n';
      await emitText(`${separator}${outcome.human}\n`);
      if (outcome.note !== undefined && io.stderr.isTTY === true) await write(io.stderr, `${outcome.note}\n`);
      first = false;
    }
  };

  async function* source(): AsyncGenerator<string> {
    const urls: AsyncIterable<string> | Iterable<string> = fromStdin ? readUrlLines(io.stdin) : positionals;
    for await (const url of urls) {
      if (io.signal?.aborted === true) return;
      yield url;
    }
  }

  try {
    const total = await mapOrdered(source(), many ? concurrency : 1, work, emit);
    if (io.signal?.aborted === true) return EXIT.interrupted;
    if (total === 0) throw new UsageError('No URL on standard input', 'Expected one URL per line.');
    if (many && !json) {
      const summary = `${succeeded} succeeded, ${failures} failed`;
      await write(io.stderr, `${failures === 0 ? err.dim(summary) : err.yellow(summary)}\n`);
    }
    return exit;
  } finally {
    await textFile?.close();
  }
}
