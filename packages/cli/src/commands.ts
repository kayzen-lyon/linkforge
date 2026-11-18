/**
 * Declarative description of the commands: their flags and their help text.
 * The parser, the help and the mapping to SDK options all read this table.
 */
import type { FlagSpec } from './args.js';

export type CommandName =
  | 'meta'
  | 'batch'
  | 'content'
  | 'extract'
  | 'links'
  | 'tables'
  | 'html'
  | 'tech'
  | 'insights'
  | 'check'
  | 'sitemap'
  | 'image'
  | 'palette'
  | 'favicon'
  | 'oembed'
  | 'shot'
  | 'pdf'
  | 'animation'
  | 'qr'
  | 'og';

export interface CommandSpec {
  readonly name: CommandName;
  readonly summary: string;
  readonly description: string;
  /** `binary` commands produce a file instead of text. */
  readonly kind: 'json' | 'binary';
  /** What the positional arguments are. Default: URLs. */
  readonly argument?: 'url' | 'title';
  readonly flags: readonly FlagSpec[];
  readonly examples: readonly string[];
}

/** Public demo instance, used when neither `--base-url` nor `OMNILLINK_URL` is set. */
export const DEFAULT_BASE_URL = 'https://omnillink.kayzen-lyon.com';
export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 16;
/** Screenshots and PDFs of slow pages take longer than the SDK's 30 s default. */
export const DEFAULT_TIMEOUT_MS = 60_000;
/** URLs sent in one `POST /meta/batch`. */
export const BATCH_SIZE = 10;

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
  /** `check --fail`: every request worked, but at least one link is broken. */
  broken: 5,
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
  { name: 'ttl', type: 'number', valueName: '<seconds>', min: 60, max: 86_400, description: 'Cache lifetime of this answer, in seconds (60–86400).' },
];

/** The three request headers the API lets a caller set on the request to the target. */
const targetHeaders: readonly FlagSpec[] = [
  { name: 'accept-language', type: 'string', valueName: '<value>', description: 'Accept-Language sent to the target, e.g. "fr-FR,fr;q=0.9".' },
  { name: 'user-agent', type: 'string', valueName: '<value>', description: 'User-Agent sent to the target.' },
  { name: 'referer', type: 'string', valueName: '<url>', description: 'Referer sent with the document request.' },
];

/** Shared by the commands that read a page. */
const page: readonly FlagSpec[] = [...targetHeaders, ...cache];

const waitForSelector: FlagSpec = {
  name: 'wait-for-selector',
  type: 'string',
  valueName: '<css>',
  description: 'Wait until this CSS selector is in the DOM (forces the browser; at most 10 s).',
};

const hideBanners: FlagSpec = {
  name: 'hide-banners',
  type: 'boolean',
  description: 'Hide common cookie / consent banners (nothing is clicked); --no-hide-banners keeps them.',
};

const blockAds: FlagSpec = {
  name: 'block-ads',
  type: 'boolean',
  description: 'Drop requests to well-known advertising and tracking hosts.',
};

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
    flags: [render, ...page],
    examples: [
      'omnillink meta https://github.com',
      'omnillink meta https://github.com --json | jq .data.image.url',
      'cat urls.txt | omnillink meta --json --concurrency 8 > meta.ndjson',
    ],
  },
  {
    name: 'batch',
    kind: 'json',
    summary: 'Metadata of many URLs in few requests (plain HTTP, 10 per call).',
    description: [
      'Sends the URLs to POST /meta/batch, ten at a time: one request instead of ten, no browser',
      '(the equivalent of `meta --render never`). One line per URL; a URL that fails is reported',
      'and does not stop the others. The batch route has its own, smaller quota.',
    ].join('\n'),
    flags: [...cache],
    examples: [
      'omnillink batch https://github.com https://example.com',
      'omnillink batch --json < urls.txt > meta.ndjson',
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
      { name: 'main-content', type: 'boolean', description: 'Keep only the main content (default); --no-main-content keeps the whole body.' },
      { name: 'include', type: 'list', valueName: '<css>', description: 'Keep only the elements matching this selector. Repeatable, or comma-separated.' },
      { name: 'exclude', type: 'list', valueName: '<css>', description: 'Remove the elements matching this selector first. Repeatable, or comma-separated.' },
      { name: 'citations', type: 'boolean', description: 'Reference-style links in the Markdown: [label][1], the numbered URLs at the end.' },
      waitForSelector,
      ...page,
    ],
    examples: [
      'omnillink content https://example.com/blog/post > post.md',
      'omnillink content https://example.com/blog/post --citations --exclude .newsletter',
      'omnillink content https://example.com/blog/post --json | jq .data.wordCount',
    ],
  },
  {
    name: 'extract',
    kind: 'json',
    summary: 'Scraping: one CSS rule per field, or a built-in preset.',
    description: [
      'Reads the fields you describe from each URL, or the typed fields of a preset',
      '(--preset article | product | recipe | event), with where each value came from.',
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
      { name: 'preset', type: 'enum', choices: ['article', 'product', 'recipe', 'event'], description: 'Built-in typed fields read from JSON-LD, microdata, Open Graph and meta tags, instead of rules.' },
      render,
      waitForSelector,
      ...page,
    ],
    examples: [
      "omnillink extract https://example.com -f 'heading=h1' -f 'links@href:url[]=a'",
      "omnillink extract https://shop.example.com/p/42 -f 'price:number=.price' --json",
      'omnillink extract https://shop.example.com/p/42 --preset product',
    ],
  },
  {
    name: 'links',
    kind: 'json',
    summary: 'Every link of a page: absolute, de-duplicated, internal or external.',
    description: 'Lists the links of each URL in document order, with their text and rel. --json gives the full records.',
    flags: [
      render,
      { name: 'scope', type: 'enum', choices: ['all', 'internal', 'external'], description: 'Keep every link, or only those on / off the page\'s own host. Default: all.' },
      { name: 'limit', type: 'number', valueName: '<n>', min: 1, max: 2000, description: 'Most links returned. Default: 500.' },
      ...page,
    ],
    examples: [
      'omnillink links https://example.com --scope external',
      "omnillink links https://example.com --json | jq -r '.data.links[].url'",
    ],
  },
  {
    name: 'tables',
    kind: 'json',
    summary: 'Data tables of a page, drawn in the terminal or exported as CSV.',
    description: 'Reads the data tables of each URL (layout tables are skipped). --csv prints one table as RFC 4180 CSV; cells a spreadsheet would run as a formula are neutralised by the server.',
    flags: [
      render,
      { name: 'selector', type: 'string', valueName: '<css>', description: 'Only the <table> elements matching this selector (e.g. "#prices").' },
      { name: 'csv', type: 'boolean', description: 'Print one table as CSV instead of drawing them all.' },
      { name: 'table', type: 'number', valueName: '<index>', min: 0, max: 19, description: 'With --csv: which table to export. Default: 0.' },
      ...page,
    ],
    examples: [
      'omnillink tables https://example.com/pricing',
      'omnillink tables https://example.com/pricing --csv --table 1 -o plans.csv',
    ],
  },
  {
    name: 'html',
    kind: 'json',
    summary: 'HTML of a page once rendered by a browser.',
    description: 'Prints the serialised DOM of each URL after its scripts have run (--render never: the markup as served). Third-party markup: treat it as untrusted input.',
    flags: [render, waitForSelector, ...page],
    examples: [
      'omnillink html https://example.com > page.html',
      'omnillink html https://example.com --render never | grep -c "<script"',
    ],
  },
  {
    name: 'tech',
    kind: 'json',
    summary: 'Technologies of a site: CMS, framework, libraries, CDN, analytics…',
    description: 'Lists what each URL is built with, each detection with its evidence, a confidence level and a version when the evidence states one. An absent technology is not proof of absence.',
    flags: [render, ...page],
    examples: [
      'omnillink tech https://example.com',
      "omnillink tech https://example.com --json | jq -r '.data.technologies[] | select(.confidence==\"high\") | .name'",
    ],
  },
  {
    name: 'insights',
    kind: 'json',
    summary: 'Page weight, requests, timings and web vitals of one load (lab).',
    description: 'Loads each URL once in a headless browser and reports what that load cost. Every number is a lab measurement from a single load in a data-centre browser: not a field score, not a Lighthouse audit. Use --force to measure again.',
    flags: [
      { name: 'device', type: 'enum', choices: ['desktop', 'mobile'], description: 'Viewport profile. No throttling in either case. Default: desktop.' },
      ...page,
    ],
    examples: ['omnillink insights https://example.com', 'omnillink insights https://example.com --device mobile --force --json'],
  },
  {
    name: 'check',
    kind: 'json',
    summary: 'State of a link right now: status, redirect chain, TLS certificate.',
    description: 'Follows each URL hop by hop without downloading bodies. A broken link is a result, not an error: the exit code stays 0 unless --fail is given. Never cached.',
    flags: [{ name: 'fail', type: 'boolean', description: 'Exit with code 5 when at least one link is broken (final status 400 or above).' }],
    examples: [
      'omnillink check http://github.com',
      'omnillink check --fail < urls.txt',
      "omnillink check --json < urls.txt | jq -r 'select(.data.ok | not) | .url'",
    ],
  },
  {
    name: 'sitemap',
    kind: 'json',
    summary: 'robots.txt and sitemaps of a site, with the URLs they list.',
    description: 'Reads robots.txt, then the sitemaps it declares (index files are followed one level). Give any URL of the site, or the URL of a sitemap file.',
    flags: [
      { name: 'limit', type: 'number', valueName: '<n>', min: 1, max: 5000, description: 'Most URLs returned. Default: 500.' },
      ...cache,
    ],
    examples: ['omnillink sitemap https://example.com', "omnillink sitemap https://example.com --limit 5000 --json | jq -r '.data.urls[].url'"],
  },
  {
    name: 'image',
    kind: 'json',
    summary: 'Real format, dimensions and weight of an image.',
    description: 'Measures an image from its first bytes, or the main preview image of a page.',
    flags: [...cache],
    examples: ['omnillink image https://example.com/cover.jpg', 'omnillink image https://github.com'],
  },
  {
    name: 'palette',
    kind: 'json',
    summary: 'Dominant colours of an image, with swatches.',
    description: 'Extracts the palette of an image, or of the main preview image of a page. Swatches are drawn when the terminal supports colour.',
    flags: [
      { name: 'count', type: 'number', valueName: '<2-8>', min: 2, max: 8, description: 'Colours wanted. Default: 5.' },
      ...cache,
    ],
    examples: ['omnillink palette https://github.com', "omnillink palette https://example.com/cover.jpg --count 3 --json | jq -r .data.dominant"],
  },
  {
    name: 'favicon',
    kind: 'json',
    summary: 'Best icon of a site, with its real dimensions.',
    description: 'Collects the icons a page declares plus /favicon.ico, measures them and picks the largest real one.',
    flags: [...page],
    examples: ['omnillink favicon https://github.com', 'omnillink favicon https://github.com --json | jq -r .data.icon.url'],
  },
  {
    name: 'oembed',
    kind: 'json',
    summary: 'oEmbed document advertised by a page.',
    description: 'Follows the oEmbed discovery link of each URL. The `html` field is untrusted third-party markup: it is shown truncated, as text.',
    flags: [
      { name: 'max-width', type: 'number', valueName: '<px>', min: 1, max: 4096, description: 'Passed to the provider as maxwidth.' },
      { name: 'max-height', type: 'number', valueName: '<px>', min: 1, max: 4096, description: 'Passed to the provider as maxheight.' },
      ...page,
    ],
    examples: ['omnillink oembed https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
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
      waitForSelector,
      { name: 'click', type: 'string', valueName: '<css>', description: 'Click this element before the capture (open a tab, expand a section).' },
      { name: 'scroll-to', type: 'string', valueName: '<css>', description: 'Scroll this element into view before the capture.' },
      { name: 'color-scheme', type: 'enum', choices: ['light', 'dark'], description: 'Emulated prefers-color-scheme.' },
      { name: 'hide', type: 'list', valueName: '<css>', description: 'CSS selector to hide before the capture. Repeatable, or comma-separated.' },
      { ...hideBanners, description: 'Hide common cookie / consent banners (default; nothing is clicked); --no-hide-banners keeps them.' },
      blockAds,
      { name: 'frame', type: 'enum', choices: ['none', 'browser', 'phone'], description: 'Device frame drawn around the capture. Not with --full-page.' },
      { name: 'radius', type: 'number', valueName: '<px>', min: 0, max: 64, description: 'Corner radius of the capture.' },
      { name: 'padding', type: 'number', valueName: '<px>', min: 0, max: 200, description: 'Space around the capture, filled with --background.' },
      { name: 'background', type: 'string', valueName: '<hex>', description: 'Colour behind the capture: RGB, RRGGBB or RRGGBBAA; 00000000 is transparent.' },
      ...page,
      outputDir,
    ],
    examples: [
      'omnillink shot https://github.com -o github.png',
      'omnillink shot https://github.com --device mobile --full-page --format jpeg --quality 80 > github.jpg',
      'omnillink shot https://github.com --frame browser --padding 48 --background f4f5f7 -o framed.png',
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
      { name: 'margin', type: 'number', valueName: '<mm>', min: 0, max: 50, description: 'Margin on every side, in millimetres. Default: the page\'s own @page margins.' },
      { name: 'scale', type: 'number', valueName: '<0.1-2>', min: 0.1, max: 2, decimal: true, description: 'Scale of the rendering. Default: 1.' },
      { name: 'page-ranges', type: 'string', valueName: '<ranges>', description: 'Pages to keep, e.g. "1-3,5".' },
      { name: 'header-text', type: 'string', valueName: '<text>', description: 'Plain text at the top of every page; {page} {pages} {title} {url} {date} are filled in.' },
      { name: 'footer-text', type: 'string', valueName: '<text>', description: 'Plain text at the bottom of every page, e.g. "Page {page} / {pages}".' },
      { ...hideBanners, description: 'Hide common cookie / consent banners before printing (nothing is clicked).' },
      blockAds,
      waitForSelector,
      ...page,
      outputDir,
    ],
    examples: [
      'omnillink pdf https://example.com -o example.pdf',
      'omnillink pdf https://example.com --format letter --landscape > example.pdf',
      "omnillink pdf https://example.com --margin 15 --footer-text 'Page {page} / {pages}' -o example.pdf",
    ],
  },
  {
    name: 'animation',
    kind: 'binary',
    summary: 'Animated scroll-through of a page, as an APNG.',
    description: 'Captures a few frames from the top to the bottom of each URL and stitches them into an animated PNG, which browsers play in an <img>.',
    flags: [
      { name: 'width', type: 'number', valueName: '<px>', min: 320, max: 1280, description: 'Viewport width. Default: 800.' },
      { name: 'height', type: 'number', valueName: '<px>', min: 240, max: 800, description: 'Viewport height. Default: 500.' },
      { name: 'frames', type: 'number', valueName: '<2-10>', min: 2, max: 10, description: 'Frames wanted. Default: 6.' },
      { name: 'delay', type: 'number', valueName: '<ms>', min: 100, max: 3000, description: 'Display time of each frame. Default: 800.' },
      { ...hideBanners, description: 'Hide common cookie / consent banners (default); --no-hide-banners keeps them.' },
      blockAds,
      ...page,
      outputDir,
    ],
    examples: ['omnillink animation https://example.com -o scroll.png', 'omnillink animation https://example.com --frames 4 --delay 1200 -o scroll.png'],
  },
  {
    name: 'qr',
    kind: 'binary',
    summary: 'QR code of a URL: in the terminal, or as an SVG / PNG file.',
    description: [
      'Encodes each URL as a QR code. The URL is only encoded, never fetched.',
      'On a terminal, without --output, the code is drawn right there; otherwise the image',
      '(SVG by default) goes to the file or the pipe.',
    ].join('\n'),
    flags: [
      { name: 'format', type: 'enum', choices: ['svg', 'png'], description: 'Image format. Default: svg.' },
      { name: 'size', type: 'number', valueName: '<px>', min: 64, max: 2048, description: 'Width and height of the image. Default: 512.' },
      { name: 'margin', type: 'number', valueName: '<modules>', min: 0, max: 16, description: 'Quiet zone around the code. Default: 4 (2 in the terminal).' },
      { name: 'ecc', type: 'enum', choices: ['L', 'M', 'Q', 'H'], caseInsensitive: true, description: 'Error-correction level. Default: M.' },
      { name: 'fg', type: 'string', valueName: '<hex>', description: 'Colour of the modules in the image file. Default: 000000.' },
      { name: 'bg', type: 'string', valueName: '<hex>', description: 'Background of the image file; 00000000 is transparent. Default: ffffff.' },
      { name: 'invert', type: 'boolean', description: 'In the terminal: swap dark and light, for a light-on-dark code.' },
      outputDir,
    ],
    examples: ['omnillink qr https://example.com', 'omnillink qr https://example.com --format png --size 1024 -o qr.png', 'omnillink qr https://example.com > qr.svg'],
  },
  {
    name: 'og',
    kind: 'binary',
    argument: 'title',
    summary: 'Social card (og:image, 1200×630) built from text.',
    description: 'Renders a card from a title and a few optional lines, with a built-in template. The argument is the title, not a URL: nothing is fetched.',
    flags: [
      { name: 'description', type: 'string', valueName: '<text>', description: 'Supporting line under the title.' },
      { name: 'site', type: 'string', valueName: '<text>', description: 'Site or brand name, bottom left.' },
      { name: 'author', type: 'string', valueName: '<text>', description: 'Author or date, bottom right.' },
      { name: 'label', type: 'string', valueName: '<text>', description: 'Small pill above the title.' },
      { name: 'template', type: 'enum', choices: ['classic', 'gradient', 'split'], description: 'Built-in template. Default: classic.' },
      { name: 'theme', type: 'enum', choices: ['light', 'dark'], description: 'Default: light.' },
      { name: 'accent', type: 'string', valueName: '<hex>', description: 'Accent colour. Default: 2563eb.' },
      { name: 'format', type: 'enum', choices: ['png', 'jpeg'], description: 'Image format. Default: png.' },
      ...cache,
      outputDir,
    ],
    examples: ["omnillink og 'Tide tables explained' --site 'Estuary Gazette' --template gradient -o card.png"],
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
  'meta-batch': 'batch',
  technologies: 'tech',
  icon: 'favicon',
  colors: 'palette',
  colours: 'palette',
  apng: 'animation',
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
  '  5  check --fail: every request worked, but at least one link is broken',
  '  With several URLs, 4 wins over 3 when both happened, and both win over 5.',
];

/** The commands in the order of the help, under a heading each. */
const GROUPS: readonly (readonly [string, readonly CommandName[]])[] = [
  ['Read a page', ['meta', 'batch', 'content', 'extract', 'links', 'tables', 'html']],
  ['Inspect a site', ['tech', 'insights', 'check', 'sitemap', 'image', 'palette', 'favicon', 'oembed']],
  ['Make a file', ['shot', 'pdf', 'animation', 'qr', 'og']],
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
    ...GROUPS.flatMap(([heading, names]) => [
      `${heading}:`,
      ...names.map((name) => `  ${name.padEnd(width)}${findCommand(name)?.summary ?? ''}`),
      '',
    ]),
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
  const [one, list] = command.argument === 'title' ? ['<title>', 'titles.txt'] : ['<url>', 'urls.txt'];
  return [
    `omnillink ${command.name} — ${command.summary}`,
    '',
    'Usage:',
    `  omnillink ${command.name} [options] ${one}...`,
    `  omnillink ${command.name} [options] < ${list}`,
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
