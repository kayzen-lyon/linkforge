/**
 * The commands added after the first five, driven through `run()` against the
 * stub, whose answers were recorded from a real instance (`recorded.json`).
 */
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COMMANDS, commandHelp, EXIT } from '../src/commands.js';
import { createStyle } from '../src/format.js';
import { run } from '../src/run.js';
import { parseQrSvg, renderQr } from '../src/views.js';
import { PNG, RECORDED, startStub, type Stub } from './stub.js';

class Capture extends Writable {
  readonly chunks: Buffer[] = [];
  constructor(
    readonly isTTY: boolean,
    readonly columns?: number,
  ) {
    super();
  }
  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.chunks.push(Buffer.from(chunk));
    done();
  }
  get bytes(): Buffer {
    return Buffer.concat(this.chunks);
  }
  get text(): string {
    return this.bytes.toString('utf8');
  }
}

interface Invocation {
  readonly stdin?: string;
  readonly tty?: boolean;
  readonly env?: Record<string, string>;
}

let stub: Stub;
let workdir: string;

async function cli(argv: string[], invocation: Invocation = {}) {
  const stdout = new Capture(invocation.tty ?? false, 100);
  const stderr = new Capture(invocation.tty ?? false);
  const stdin = Object.assign(Readable.from(invocation.stdin === undefined ? [] : [invocation.stdin]), {
    isTTY: invocation.stdin === undefined,
  });
  const code = await run({ argv, env: { OMNILLINK_URL: stub.baseUrl, ...invocation.env }, stdin, stdout, stderr, cwd: workdir });
  return { code, stdout: stdout.text, stderr: stderr.text, bytes: stdout.bytes };
}

const query = (index = 0): Record<string, string> => Object.fromEntries(stub.requests[index]?.query ?? []);
const SITE = 'https://site.test/';

beforeAll(async () => {
  stub = await startStub();
  workdir = await mkdtemp(join(tmpdir(), 'omnillink-cli-'));
});
afterAll(async () => {
  await stub.close();
  await rm(workdir, { recursive: true, force: true });
});
beforeEach(() => {
  stub.requests.length = 0;
});

describe('tech', () => {
  it('draws a table with version, category, confidence and evidence', async () => {
    const { code, stdout } = await cli(['tech', SITE, '--render', 'never', '--user-agent', 'UA/1']);
    expect(code).toBe(EXIT.ok);
    expect(stub.requests[0]?.endpoint).toBe('tech');
    expect(query()).toEqual({ url: SITE, render: 'never', userAgent: 'UA/1' });
    const lines = stdout.split('\n');
    expect(lines[0]).toBe('https://site.test/');
    expect(lines[1]).toMatch(/^ {2}Technology +Category +Confidence +Evidence$/);
    expect(lines[2]).toMatch(/^ {2}WordPress 6\.5\.2 +cms +●●● high +meta generator: WordPress 6\.5\.2$/);
    expect(lines[3]).toMatch(/^ {2}nginx 1\.24\.0 +server +●●● high +header server: nginx\/1\.24\.0$/);
    expect(stdout).toContain('2 technologies · 0 bundles read · not rendered');
    expect(stdout).not.toContain('\u001b');
  });

  it('gives the whole record with --json, response headers included', async () => {
    const { stdout } = await cli(['tech', SITE, '--json']);
    const record = JSON.parse(stdout) as { ok: boolean; data: { technologies: unknown[] }; meta: unknown; response: { requestId: string; cache: string } };
    expect(record.ok).toBe(true);
    expect(record.data.technologies).toHaveLength(2);
    expect(record.response).toMatchObject({ requestId: 'req-stub', cache: 'MISS', status: 200 });
  });
});

describe('check', () => {
  it('shows the verdict and the redirect chain', async () => {
    const { code, stdout } = await cli(['check', 'https://site.test/old']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: 'https://site.test/old' });
    expect(stdout.split('\n').slice(0, 4)).toEqual([
      '✓ 200  https://site.test/  2 redirects',
      '  ├─ 301  https://site.test/old  1 ms',
      '  ├─ 302  https://site.test/hop  1 ms',
      '  └─ 200  https://site.test/  1 ms',
    ]);
    expect(stdout).toContain('  Type    text/html');
    expect(stdout).toContain('  Length  4.4 kB');
  });

  it('a broken link is a result: exit 0, or 5 with --fail', async () => {
    const plain = await cli(['check', 'https://broken.test/x']);
    expect(plain.code).toBe(EXIT.ok);
    expect(plain.stdout).toContain('✗ 404  https://broken.test/x  direct');

    const strict = await cli(['check', '--fail', 'https://site.test/old', 'https://broken.test/x']);
    expect(strict.code).toBe(EXIT.broken);
    expect(strict.stderr).toContain('2 succeeded, 0 failed, 1 broken');
  });

  it('an API error outranks a broken link', async () => {
    const { code } = await cli(['check', '--fail', 'https://broken.test/x', 'https://forbidden.test/']);
    expect(code).toBe(EXIT.api);
  });

  it('has no cache flags', async () => {
    const { code, stderr } = await cli(['check', SITE, '--force']);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('Unknown option --force for this command');
  });
});

describe('palette', () => {
  it('lists the colours with their share, without escape codes when colours are off', async () => {
    const { code, stdout } = await cli(['palette', SITE, '--count', '3']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: SITE, count: '3' });
    expect(stdout).toContain('  Dominant  #14589f');
    expect(stdout).toMatch(/^ {2}#14589f {2}rgb\(20, 88, 159\) +60\.0 % +█+$/m);
    expect(stdout).not.toContain('\u001b');
  });

  it('paints true-colour swatches when colours are on', async () => {
    const { stdout } = await cli(['palette', SITE, '--color']);
    expect(stdout).toContain('\u001b[48;2;20;88;159m      \u001b[49m');
    expect(stdout).toContain('\u001b[48;2;242;233;220m');
  });
});

describe('links', () => {
  it('lists the links with their scope', async () => {
    const { code, stdout } = await cli(['links', SITE, '--scope', 'external', '--limit', '50']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: SITE, scope: 'external', limit: '50' });
    expect(stdout).toContain('5 links · 3 internal · 2 external');
    expect(stdout).toMatch(/^ {2}↗ open data portal +https:\/\/data\.example\.org\/tides$/m);
    expect(stdout).toMatch(/^ {2}· Kettle +https:\/\/site\.test\/product$/m);
    expect(stdout).toMatch(/^ {2}↗ Partner +https:\/\/partner\.example\.org\/ nofollow$/m);
  });
});

describe('tables', () => {
  it('draws each table', async () => {
    const { code, stdout } = await cli(['tables', SITE, '--selector', '#prices']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: SITE, selector: '#prices' });
    expect(stdout).toContain('  Table 0 — Plans  3 rows × 3 columns');
    expect(stdout).toMatch(/^ {2}Plan +│ Price +│ Requests$/m);
    expect(stdout).toMatch(/^ {2}Pro +│ €19 +│ 50,000$/m);
  });

  it('--csv prints the CSV of one table, as the server neutralised it', async () => {
    const { code, stdout } = await cli(['tables', SITE, '--csv', '--table', '0']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: SITE, table: '0', format: 'csv' });
    expect(stdout).toBe(`${RECORDED.tablesCsv.replace(/\r\n$/, '')}\n`);
    expect(stdout).toContain("'=SUM(A1:A2)");
  });

  it('--csv -o writes the file', async () => {
    const { code, stdout } = await cli(['tables', SITE, '--csv', '-o', 'plans.csv']);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toBe('');
    expect(await readFile(join(workdir, 'plans.csv'), 'utf8')).toContain('Plan,Price,Requests');
  });

  it('--table needs --csv', async () => {
    const { code, stderr } = await cli(['tables', SITE, '--table', '1']);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('--table selects the table that --csv exports');
    expect(stub.requests).toHaveLength(0);
  });
});

describe('html', () => {
  it('prints the markup as is', async () => {
    const { code, stdout } = await cli(['html', SITE, '--render', 'never', '--wait-for-selector', 'main']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: SITE, render: 'never', waitForSelector: 'main' });
    expect(stdout).toBe(`${RECORDED.html.trimEnd()}\n`);
  });

  it('--json carries the text and the final URL', async () => {
    const { stdout } = await cli(['html', SITE, '--json']);
    const record = JSON.parse(stdout) as { data: string; response: { finalUrl: string } };
    expect(record.data).toBe(RECORDED.html);
    expect(record.response.finalUrl).toBe(SITE);
  });
});

describe('insights, image, favicon, oembed, sitemap', () => {
  it('insights says what kind of measurement it is', async () => {
    const { code, stdout } = await cli(['insights', SITE, '--device', 'mobile', '--force']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: SITE, device: 'mobile', force: 'true' });
    expect(stdout).toContain('Lab measurement: one load, cold cache, no throttling, data-centre browser. Not a field score.');
    expect(stdout).toMatch(/^ {2}Requests +\d+$/m);
    expect(stdout).toMatch(/^ {2}document +1 +[\d.]+ k?B +█+$/m);
  });

  it('image', async () => {
    const { stdout } = await cli(['image', SITE]);
    expect(stdout).toContain('https://site.test/cover.png');
    expect(stdout).toContain('  Size    120×63');
    expect(stdout).toContain('  Weight  210 B');
  });

  it('favicon lists every icon measured, best first', async () => {
    const { stdout } = await cli(['favicon', SITE, '--accept-language', 'fr']);
    expect(query()).toEqual({ url: SITE, acceptLanguage: 'fr' });
    expect(stdout.split('\n')[0]).toBe('https://site.test/apple.png  best icon of https://site.test/');
    expect(stdout).toMatch(/^ {2}180×180 +png +apple-touch-icon +\d+ B +https:\/\/site\.test\/apple\.png$/m);
    expect(stdout).toMatch(/^ {2}32×32 +png +icon +\d+ B +https:\/\/site\.test\/icon\.png$/m);
  });

  it('oembed shows the markup as flagged, truncated text', async () => {
    const { stdout } = await cli(['oembed', SITE, '--max-width', '600']);
    expect(query()).toEqual({ url: SITE, maxWidth: '600' });
    expect(stdout).toContain('  Provider   Estuary Gazette · https://site.test/');
    expect(stdout).toMatch(/HTML +<blockquote>.*\(untrusted markup\)$/m);
  });

  it('sitemap lists the files, their errors and the URLs', async () => {
    const { stdout } = await cli(['sitemap', SITE, '--limit', '100']);
    expect(query()).toEqual({ url: SITE, limit: '100' });
    expect(stdout.split('\n')[0]).toBe('✓ https://site.test/robots.txt  robots.txt found');
    expect(stdout).toMatch(/^ {2}index +— +https:\/\/site\.test\/sitemap\.xml$/m);
    expect(stdout).toMatch(/^ {2}unknown +0 +https:\/\/site\.test\/sitemap-missing\.xml +HTTP 404$/m);
    expect(stdout).toContain('  https://site.test/  2026-11-02');
    expect(stdout).toContain('4 URLs in 3 files');
  });
});

describe('extract --preset', () => {
  it('prints the typed fields with where each came from', async () => {
    const { code, stdout } = await cli(['extract', 'https://site.test/product', '--preset', 'product']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: 'https://site.test/product', preset: 'product' });
    expect(stdout.split('\n')[0]).toBe('https://site.test/product  product preset · schema.org Product');
    expect(stdout).toMatch(/^ {2}price +64 {2}← json-ld$/m);
    expect(stdout).toMatch(/^ {2}brand +Kettlewell {2}← json-ld$/m);
  });

  it('refuses rules and a preset together', async () => {
    const { code, stderr } = await cli(['extract', SITE, '--preset', 'article', '-f', 'h=h1']);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('--preset replaces the rules');
    expect(stub.requests).toHaveLength(0);
  });
});

describe('batch', () => {
  it('sends the URLs in one POST and prints one line per URL', async () => {
    const { code, stdout, stderr } = await cli(['batch', 'https://a.test/', 'https://b.test/gone', '--force']);
    expect(code).toBe(EXIT.api);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ endpoint: 'meta/batch', method: 'POST', body: { urls: ['https://a.test/', 'https://b.test/gone'], force: true } });
    expect(stdout).toBe('✓ Title of a.test  https://a.test/\n');
    expect(stderr).toContain('✗ ETARGETSTATUS  https://b.test/gone  The target responded with HTTP 404');
    expect(stderr).toContain('1 succeeded, 1 failed');
  });

  it('groups a long list by ten, keeps the order, and prints one record per URL with --json', async () => {
    const urls = Array.from({ length: 23 }, (_, index) => `https://h${index}.test/`);
    const { code, stdout } = await cli(['batch', '--json'], { stdin: `${urls.join('\n')}\n` });
    expect(code).toBe(EXIT.ok);
    expect(stub.requests.map((request) => (request.body as { urls: string[] }).urls.length)).toEqual([10, 10, 3]);
    const records = stdout.trim().split('\n').map((line) => JSON.parse(line) as { url: string; ok: boolean; data: { title: string } });
    expect(records.map((record) => record.url)).toEqual(urls);
    expect(records.every((record) => record.ok)).toBe(true);
    expect(records[22]?.data.title).toBe('Title of h22.test');
  });

  it('a refused request fails every URL of its group, with the retry delay', async () => {
    const { code, stdout } = await cli(['batch', 'https://rate.test/', 'https://a.test/', '--json']);
    expect(code).toBe(EXIT.api);
    const records = stdout.trim().split('\n').map((line) => JSON.parse(line) as { ok: boolean; error: { code: string; retryable: boolean; retryAfter: number } });
    expect(records).toHaveLength(2);
    expect(records.every((record) => !record.ok && record.error.code === 'ERATELIMIT' && record.error.retryable && record.error.retryAfter === 7)).toBe(true);
  });
});

describe('qr', () => {
  it('draws the code on a terminal', async () => {
    const { code, stdout } = await cli(['qr', SITE, '--no-color'], { tty: true });
    expect(code).toBe(EXIT.ok);
    // The terminal view asks for an SVG with a quiet zone of 2 modules.
    expect(query()).toEqual({ url: SITE, format: 'svg', margin: '2' });
    const lines = stdout.trimEnd().split('\n');
    const modules = parseQrSvg(RECORDED.qrSvg)!;
    expect(lines).toHaveLength(Math.ceil(modules.length / 2) + 1);
    expect(lines.at(-1)).toBe(SITE);
    expect(lines.slice(0, -1).every((line) => /^[█▀▄ ]+$/.test(line) && line.length === modules.length)).toBe(true);
  });

  it('paints black on white when colours are on, and honours --invert', async () => {
    const colored = await cli(['qr', SITE, '--color'], { tty: true });
    expect(colored.stdout.startsWith('\u001b[30;47m')).toBe(true);
    const plain = await cli(['qr', SITE, '--no-color'], { tty: true });
    const inverted = await cli(['qr', SITE, '--no-color', '--invert'], { tty: true });
    expect(inverted.stdout).not.toBe(plain.stdout);
  });

  it('writes the SVG to a pipe, and a PNG to a file', async () => {
    const piped = await cli(['qr', SITE, '--ecc', 'h', '--fg', '112233', '--bg', '00000000']);
    expect(piped.code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: SITE, ecc: 'H', color: '112233', background: '00000000' });
    expect(piped.stdout).toBe(RECORDED.qrSvg);

    stub.requests.length = 0;
    const saved = await cli(['qr', SITE, '--format', 'png', '--size', '256', '-o', 'qr.png', '--json']);
    expect(query()).toEqual({ url: SITE, format: 'png', size: '256' });
    expect(JSON.parse(saved.stdout)).toMatchObject({ ok: true, type: 'image/png', bytes: PNG.byteLength, file: join(workdir, 'qr.png') });
    expect(await readFile(join(workdir, 'qr.png'))).toEqual(PNG);
  });

  it('names the files after the URL and the format with --output-dir', async () => {
    await cli(['qr', SITE, 'https://other.test/', '-d', 'codes']);
    const files = await readdir(join(workdir, 'codes'));
    expect(files.sort()).toEqual([expect.stringMatching(/^other\.test-[0-9a-f]{8}\.svg$/), expect.stringMatching(/^site\.test-[0-9a-f]{8}\.svg$/)]);
  });

  it('still refuses a PNG on a terminal, and reports an SVG it cannot read', async () => {
    const png = await cli(['qr', SITE, '--format', 'png'], { tty: true });
    expect(png.code).toBe(EXIT.usage);
    expect(png.stderr).toContain('Refusing to write binary data to the terminal');

    const odd = await cli(['qr', 'https://odd.test/'], { tty: true });
    expect(odd.code).toBe(EXIT.failure);
    expect(odd.stderr).toContain('use --output qr.svg');
  });

  it('parseQrSvg() rejects what is not a QR drawing, renderQr() is two modules per row', () => {
    expect(parseQrSvg('<svg viewBox="0 0 10 10"><path d="M0 0h1v1h-1z"/></svg>')).toBeNull();
    expect(parseQrSvg('<svg viewBox="0 0 25 25"><path d="M24 0h5v1h-5z"/></svg>')).toBeNull();
    expect(parseQrSvg('not svg')).toBeNull();
    expect(renderQr([[true, false], [false, true]], { color: false, invert: false })).toBe('▄▀');
    expect(renderQr([[true, false], [false, true]], { color: false, invert: true })).toBe('▀▄');
    expect(renderQr([[true, true], [true, true]], { color: true, invert: false })).toBe('\u001b[30;47m██\u001b[39;49m');
  });
});

describe('og', () => {
  it('takes a title, not a URL', async () => {
    const { code, stdout } = await cli(['og', 'Tide tables <explained>', '--site', 'Estuary Gazette', '--template', 'gradient', '--theme', 'dark', '--accent', 'ff0066', '-o', 'card.png']);
    expect(code).toBe(EXIT.ok);
    expect(stub.requests[0]?.endpoint).toBe('og');
    expect(query()).toEqual({ title: 'Tide tables <explained>', site: 'Estuary Gazette', template: 'gradient', theme: 'dark', accent: 'ff0066' });
    expect(stdout).toContain('✓ card.png  image/png');
    expect(await readFile(join(workdir, 'card.png'))).toEqual(PNG);
  });

  it('needs a title', async () => {
    const { code, stderr } = await cli(['og'], { tty: true });
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('Missing title');
  });
});

describe('animation', () => {
  it('saves an APNG as .png and reports its frames', async () => {
    const { code, stdout } = await cli(['animation', SITE, '--frames', '4', '--delay', '1200', '--no-hide-banners', '-d', 'anim']);
    expect(code).toBe(EXIT.ok);
    expect(query()).toEqual({ url: SITE, frames: '4', delay: '1200', hideBanners: 'false' });
    expect(stdout).toMatch(/✓ anim\/site\.test-[0-9a-f]{8}\.png {2}image\/apng, 4 frames/);
    const json = await cli(['animation', SITE, '-o', 'scroll.png', '--json']);
    expect(JSON.parse(json.stdout)).toMatchObject({ type: 'image/apng', frames: 4 });
  });
});

describe('new flags on the first commands', () => {
  it('shot forwards preparation and decoration', async () => {
    await cli(['shot', SITE, '-o', 's.png', '--frame', 'browser', '--radius', '12', '--padding', '40', '--background', 'f4f5f7', '--click', '.tab', '--scroll-to', '#pricing', '--wait-for-selector', '#app', '--block-ads', '--no-hide-banners', '--referer', 'https://r.test/']);
    expect(query()).toEqual({
      url: SITE, frame: 'browser', radius: '12', padding: '40', background: 'f4f5f7', click: '.tab', scrollTo: '#pricing',
      waitForSelector: '#app', blockAds: 'true', hideBanners: 'false', referer: 'https://r.test/',
    });
  });

  it('pdf forwards margins, a decimal scale, ranges, header and footer', async () => {
    await cli(['pdf', SITE, '-o', 'p.pdf', '--margin', '15', '--scale', '0.8', '--page-ranges', '1-3,5', '--header-text', '{title}', '--footer-text', 'Page {page} / {pages}', '--hide-banners']);
    expect(query()).toEqual({ url: SITE, margin: '15', scale: '0.8', pageRanges: '1-3,5', headerText: '{title}', footerText: 'Page {page} / {pages}', hideBanners: 'true' });
    const bad = await cli(['pdf', SITE, '-o', 'p.pdf', '--scale', '3']);
    expect(bad.code).toBe(EXIT.usage);
    expect(bad.stderr).toContain('--scale expects a number between 0.1 and 2');
  });

  it('content forwards the selection options', async () => {
    await cli(['content', SITE, '--no-main-content', '--include', 'article', '--include', '.lead,.intro', '--exclude', '.ad', '--citations', '--ttl', '120']);
    expect(query()).toEqual({ url: SITE, mainContent: 'false', include: 'article,.lead,.intro', exclude: '.ad', citations: 'true', ttl: '120' });
  });

  it('--ttl is checked against the range of the API before anything is sent', async () => {
    const { code, stderr } = await cli(['meta', SITE, '--ttl', '5']);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('--ttl expects an integer between 60 and 86400');
    expect(stub.requests).toHaveLength(0);
  });
});

describe('--help stays accurate', () => {
  it.each(COMMANDS.map((command) => command.name))('%s --help lists every flag of the command', async (name) => {
    const { code, stdout } = await cli([name, '--help']);
    expect(code).toBe(EXIT.ok);
    const command = COMMANDS.find((candidate) => candidate.name === name)!;
    expect(stdout).toBe(`${commandHelp(command)}\n`);
    for (const flag of command.flags) expect(stdout).toContain(`--${flag.name}`);
    expect(stdout).toContain(`omnillink ${name} [options] ${name === 'og' ? '<title>' : '<url>'}...`);
  });

  it('no command redefines a global flag, and every flag name is unique within a command', () => {
    const globals = new Set(['base-url', 'api-key', 'json', 'output', 'concurrency', 'timeout', 'color', 'help', 'version']);
    for (const command of COMMANDS) {
      const names = command.flags.map((flag) => flag.name);
      expect(new Set(names).size, command.name).toBe(names.length);
      expect(names.filter((flagName) => globals.has(flagName)), command.name).toEqual([]);
    }
  });

  it('aliases resolve', async () => {
    const { stdout } = await cli(['technologies', '--help']);
    expect(stdout).toContain('omnillink tech —');
  });
});

describe('views are safe with hostile page text', () => {
  it('strips escape sequences from a technology name', async () => {
    const { formatTech } = await import('../src/views.js');
    const out = formatTech(
      {
        data: { url: 'https://a.test/', technologies: [{ name: 'Evil\u001b[2J', category: 'cms', evidence: 'x\u0007y', confidence: 'low', version: null }], inspected: { bundles: 0, rendered: false } },
        meta: { cached: false, source: 'http', durationMs: 1 },
        response: { status: 200, cache: null, renderSource: null, requestId: null, etag: null, rateLimit: null, finalUrl: null, animationFrames: null, qrVersion: null },
      },
      createStyle(false),
    );
    expect(out).not.toContain('\u001b');
    expect(out).not.toContain('\u0007');
    expect(out).toContain('Evil[2J');
  });
});
