/**
 * Declarative description of the commands: their flags and their help text.
 * The parser, the help and the mapping to SDK options all read this table.
 */
import type { FlagSpec } from './args.js';

export type CommandName = 'meta' | 'shot' | 'pdf' | 'extract' | 'content';

export interface CommandSpec {
  readonly name: CommandName;
  readonly summary: string;
  readonly description: string;
  /** `binary` commands produce a file instead of text. */
  readonly kind: 'json' | 'binary';
  readonly flags: readonly FlagSpec[];
  readonly examples: readonly string[];
}

/** Public demo instance, used when neither `--base-url` nor `OMNILLINK_URL` is set. */
export const DEFAULT_BASE_URL = 'https://omnillink.kayzen-lyon.com';
export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 16;
/** Screenshots and PDFs of slow pages take longer than the SDK's 30 s default. */
export const DEFAULT_TIMEOUT_MS = 60_000;

export const EXIT = {
  ok: 0,
  /** Unexpected failure, or a local I/O error (a file that cannot be written). */
  failure: 1,
  /** The command line is wrong; nothing was requested. */
  usage: 2,
  /** The Omnillink instance answered with an error. */
  api: 3,
  /** No usable answer: DNS, refused connection, timeout. */
  network: 4,
  /** Interrupted with Ctrl+C. */
  interrupted: 130,
} as const;

const render: FlagSpec = {
  name: 'render',
  type: 'enum',
  choices: ['auto', 'never', 'always'],
  description: 'Headless-browser strategy: auto (only when plain HTTP gives too little), never, always.',
};

const cache: readonly FlagSpec[] = [
  { name: 'force', type: 'boolean', description: 'Bypass the server cache read (the fresh answer is still stored).' },
  { name: 'ttl', type: 'number', valueName: '<seconds>', min: 1, description: 'Cache lifetime of this answer, in seconds.' },
];

const outputDir: FlagSpec = {
  name: 'output-dir',
  short: 'd',
  type: 'string',
  valueName: '<dir>',
  description: 'Write one file per URL into this directory, named after the URL. Required with several URLs.',
};

export const GLOBAL_FLAGS: readonly FlagSpec[] = [
  {
    name: 'base-url',
    type: 'string',
    valueName: '<url>',
    description: `Origin of the Omnillink instance. Env: OMNILLINK_URL. Default: ${DEFAULT_BASE_URL}`,
  },
  {
    name: 'api-key',
    type: 'string',
    valueName: '<key>',
    secret: true,
    description: 'API key, sent as the x-api-key header. Prefer the OMNILLINK_API_KEY variable: arguments show up in `ps`.',
  },
  { name: 'json', short: 'j', type: 'boolean', description: 'Machine-readable output: one JSON record per URL.' },
  {
    name: 'output',
    short: 'o',
    type: 'string',
    valueName: '<file>',
    description: 'Write the result to this file instead of standard output.',
  },
  {
    name: 'concurrency',
    short: 'c',
    type: 'number',
    valueName: '<n>',
    min: 1,
    max: MAX_CONCURRENCY,
    description: `Requests in flight when several URLs are given. Default: ${DEFAULT_CONCURRENCY}`,
  },
  {
    name: 'timeout',
    type: 'number',
    valueName: '<ms>',
    min: 0,
    description: `Time allowed per request, in milliseconds; 0 disables it. Default: ${DEFAULT_TIMEOUT_MS}`,
  },
  { name: 'color', type: 'boolean', description: 'Force colours on; --no-color turns them off. Default: on for a terminal, off when NO_COLOR is set.' },
  { name: 'help', short: 'h', type: 'boolean', description: 'Show this help.' },
  { name: 'version', short: 'V', type: 'boolean', description: 'Print the version.' },
];

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: 'meta',
    kind: 'json',
    summary: 'Rich metadata of a page: title, description, image, favicon, feeds…',
    description: 'Fetches the metadata of each URL and prints a summary, or the full record with --json.',
    flags: [render, ...cache],
    examples: [
      'omnillink meta https://github.com',
      'omnillink meta https://github.com --json | jq .data.image.url',
      'cat urls.txt | omnillink meta --json --concurrency 8 > meta.ndjson',
    ],
  },
  {
    name: 'shot',
    kind: 'binary',
    summary: 'Screenshot of a page, as PNG or JPEG.',
    description: 'Captures each URL in a headless browser and writes the image to a file, or to a pipe.',
    flags: [
      { name: 'device', type: 'enum', choices: ['desktop', 'mobile'], description: 'Viewport profile. Default: desktop.' },
      { name: 'full-page', type: 'boolean', description: 'Capture the whole page instead of the viewport.' },
      { name: 'format', type: 'enum', choices: ['png', 'jpeg'], description: 'Image format. Default: png.' },
      { name: 'quality', type: 'number', valueName: '<1-100>', min: 1, max: 100, description: 'JPEG quality.' },
      { name: 'width', type: 'number', valueName: '<px>', min: 1, description: 'Viewport width, in CSS pixels.' },
      { name: 'height', type: 'number', valueName: '<px>', min: 1, description: 'Viewport height, in CSS pixels.' },
      { name: 'selector', type: 'string', valueName: '<css>', description: 'Capture only the first element matching this CSS selector.' },
      { name: 'wait-for', type: 'string', valueName: '<ms>', description: 'Extra wait before the capture; sent to the server as is.' },
      { name: 'color-scheme', type: 'enum', choices: ['light', 'dark'], description: 'Emulated prefers-color-scheme.' },
      { name: 'hide', type: 'list', valueName: '<css>', description: 'CSS selector to hide before the capture. Repeatable, or comma-separated.' },
      ...cache,
      outputDir,
    ],
    examples: [
      'omnillink shot https://github.com -o github.png',
      'omnillink shot https://github.com --device mobile --full-page --format jpeg --quality 80 > github.jpg',
      'omnillink shot --output-dir shots < urls.txt',
    ],
  },
  {
    name: 'pdf',
    kind: 'binary',
    summary: 'PDF of a page, printed with its print stylesheet.',
    description: 'Prints each URL to PDF in a headless browser and writes it to a file, or to a pipe.',
    flags: [
      { name: 'format', type: 'enum', choices: ['A4', 'Letter'], caseInsensitive: true, description: 'Paper format. Default: A4.' },
      { name: 'landscape', type: 'boolean', description: 'Landscape orientation.' },
      { name: 'print-background', type: 'boolean', description: 'Print CSS backgrounds; --no-print-background leaves them out.' },
      ...cache,
      outputDir,
    ],
    examples: [
      'omnillink pdf https://example.com -o example.pdf',
      'omnillink pdf https://example.com --format letter --landscape > example.pdf',
    ],
  },
  {
    name: 'extract',
    kind: 'json',
    summary: 'Custom scraping: one CSS rule per field.',
    description: [
      'Reads the fields you describe from each URL.',
      '',
      'A rule is NAME=SELECTOR. Modifiers go on the name, never in the selector:',
      '  NAME@ATTR     read an attribute (href, src, data-id…) or `html`; default: the text',
      '  NAME:TYPE     coerce to string (default), number or url',
      '  NAME[]        return every match as an array',
      'They combine in that order: links@href:url[]=a',
    ].join('\n'),
    flags: [
      { name: 'field', short: 'f', type: 'list', valueName: '<rule>', noSplit: true, description: 'One extraction rule, NAME[@ATTR][:TYPE][[]]=SELECTOR. Repeatable.' },
      { name: 'fields', type: 'string', valueName: '<json>', description: 'All the rules as the JSON object the API takes: {"price":{"selector":".price","type":"number"}}' },
      render,
    ],
    examples: [
      "omnillink extract https://example.com -f 'heading=h1' -f 'links@href:url[]=a'",
      "omnillink extract https://shop.example.com/p/42 -f 'price:number=.price' --json",
    ],
  },
  {
    name: 'content',
    kind: 'json',
    summary: 'Readable content of a page, as Markdown or plain text.',
    description:
      'Prints the main content of each URL as Markdown: no navigation, sidebars or footers. Made to be piped into a file or a model.',
    flags: [
      render,
      { name: 'text', type: 'boolean', description: 'Print plain text instead of Markdown.' },
    ],
    examples: [
      'omnillink content https://example.com/blog/post > post.md',
      'omnillink content https://example.com/blog/post --json | jq .data.wordCount',
    ],
  },
];

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.name === name);
}

/** Names accepted for a command besides its own. */
export const ALIASES: Readonly<Record<string, CommandName>> = {
  screenshot: 'shot',
  metadata: 'meta',
  markdown: 'content',
};

function flagLabel(spec: FlagSpec): string {
  const short = spec.short === undefined ? '    ' : `-${spec.short}, `;
  const value =
    spec.type === 'boolean' ? '' : spec.type === 'enum' ? ` <${spec.choices.join('|')}>` : ` ${spec.valueName}`;
  return `${short}--${spec.name}${value}`;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line !== '' && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function flagTable(specs: readonly FlagSpec[]): string[] {
  const labels = specs.map(flagLabel);
  const column = Math.min(34, Math.max(...labels.map((label) => label.length)) + 2);
  return specs.flatMap((spec, index) => {
    const label = labels[index] ?? '';
    const description = wrap(spec.description, Math.max(30, 96 - column));
    const first = label.length + 2 > column ? [`  ${label}`, `  ${' '.repeat(column)}${description[0] ?? ''}`] : [`  ${label.padEnd(column)}${description[0] ?? ''}`];
    return [...first, ...description.slice(1).map((line) => `  ${' '.repeat(column)}${line}`)];
  });
}

const EXIT_CODES = [
  'Exit codes:',
  '  0  success',
  '  1  unexpected failure, or a file that could not be written',
  '  2  usage error: nothing was requested',
  '  3  the Omnillink instance answered with an error',
  '  4  network error or timeout: no usable answer',
  '  With several URLs, 4 wins over 3 when both happened.',
];

export function mainHelp(version: string): string {
  const width = Math.max(...COMMANDS.map((command) => command.name.length)) + 2;
  return [
    `omnillink ${version} — link intelligence from the command line`,
    '',
    'Usage:',
    '  omnillink <command> [options] <url>...',
    '  omnillink <command> [options] < urls.txt     one URL per line, # for comments',
    '',
    'Commands:',
    ...COMMANDS.map((command) => `  ${command.name.padEnd(width)}${command.summary}`),
    '',
    'Global options:',
    ...flagTable(GLOBAL_FLAGS),
    '',
    'Environment:',
    '  OMNILLINK_URL       origin of the instance (same as --base-url)',
    '  OMNILLINK_API_KEY   API key (same as --api-key); never printed',
    '  NO_COLOR            disable colours',
    '',
    ...EXIT_CODES,
    '',
    'Run `omnillink <command> --help` for the options of a command.',
  ].join('\n');
}

export function commandHelp(command: CommandSpec): string {
  return [
    `omnillink ${command.name} — ${command.summary}`,
    '',
    'Usage:',
    `  omnillink ${command.name} [options] <url>...`,
    `  omnillink ${command.name} [options] < urls.txt`,
    '',
    command.description,
    '',
    'Options:',
    ...flagTable(command.flags),
    '',
    'Global options:',
    ...flagTable(GLOBAL_FLAGS),
    '',
    'Examples:',
    ...command.examples.map((example) => `  ${example}`),
    '',
    ...EXIT_CODES,
  ].join('\n');
}
