import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { mapOrdered } from '../src/batch.js';
import { EXIT } from '../src/commands.js';
import { buildFields, parseFieldRule, run } from '../src/run.js';
import { PDF, PNG, startStub, type Stub } from './stub.js';

class Capture extends Writable {
  readonly chunks: Buffer[] = [];
  constructor(readonly isTTY: boolean) {
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
  readonly cwd?: string;
  /** Leave OMNILLINK_URL out, to exercise the default instance. */
  readonly noBaseUrl?: boolean;
}

let stub: Stub;
let workdir: string;

async function cli(argv: string[], invocation: Invocation = {}) {
  const stdout = new Capture(invocation.tty ?? false);
  const stderr = new Capture(invocation.tty ?? false);
  const stdin = Object.assign(Readable.from(invocation.stdin === undefined ? [] : [invocation.stdin]), {
    isTTY: invocation.stdin === undefined,
  });
  const code = await run({
    argv,
    env: { ...(invocation.noBaseUrl === true ? {} : { OMNILLINK_URL: stub.baseUrl }), ...invocation.env },
    stdin,
    stdout,
    stderr,
    cwd: invocation.cwd ?? workdir,
  });
  return { code, stdout: stdout.text, stderr: stderr.text, bytes: stdout.bytes };
}

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
  stub.maxInFlight = 0;
});

describe('help and version', () => {
  it('prints the version', async () => {
    const { code, stdout } = await cli(['--version']);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it('prints the main help on stdout with --help, on stderr without arguments', async () => {
    const help = await cli(['--help']);
    expect(help.code).toBe(EXIT.ok);
    expect(help.stdout).toContain('Commands:');
    const bare = await cli([]);
    expect(bare.code).toBe(EXIT.usage);
    expect(bare.stdout).toBe('');
    expect(bare.stderr).toContain('Commands:');
  });

  it.each(['meta', 'shot', 'pdf', 'extract', 'content'])('documents every flag of `%s --help`', async (command) => {
    const { code, stdout } = await cli([command, '--help']);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toContain(`omnillink ${command} —`);
    expect(stdout).toContain('--base-url <url>');
    expect(stdout).toContain('Exit codes:');
    expect(stub.requests).toHaveLength(0);
  });

  it('accepts `help <command>` and aliases', async () => {
    expect((await cli(['help', 'screenshot'])).stdout).toContain('omnillink shot —');
  });
});

describe('usage errors (exit 2, nothing requested)', () => {
  it.each([
    [['meta'], 'Missing URL'],
    [['meta', 'github.com'], 'Did you mean https://github.com?'],
    [['meta', 'https://ok.test', '--rendr', 'never'], 'Did you mean --render?'],
    [['meta', 'https://ok.test', '--full-page'], '--full-page belongs to `omnillink shot`.'],
    [['mta', 'https://ok.test'], 'Did you mean `omnillink meta`?'],
    [['https://ok.test'], 'Try: omnillink meta https://ok.test'],
    [['extract', 'https://ok.test'], 'extract needs at least one rule'],
    [['extract', 'https://ok.test', '-f', 'nope'], 'missing NAME='],
    [['shot', 'https://ok.test', 'https://b.test', '-o', 'x.png'], '--output names one file'],
    [['shot', 'https://ok.test', '--json'], 'add --output <file>'],
    [['meta', 'https://ok.test', '--base-url', 'ftp://x'], 'must start with http:// or https://'],
    [['meta', 'https://ok.test', '--base-url', 'https://user:hunter2@x.test'], 'must not contain credentials'],
    [['meta', '-', 'https://ok.test'], 'cannot be mixed'],
  ])('%j → %s', async (argv, expected) => {
    const { code, stdout, stderr } = await cli(argv);
    expect(code).toBe(EXIT.usage);
    expect(stdout).toBe('');
    expect(stderr).toContain(expected);
    expect(stderr).not.toContain('hunter2');
    expect(stub.requests).toHaveLength(0);
  });

  it('refuses to dump binary data to a terminal', async () => {
    const { code, stderr, bytes } = await cli(['shot', 'https://ok.test'], { tty: true });
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('Refusing to write binary data to the terminal');
    expect(bytes).toHaveLength(0);
    expect(stub.requests).toHaveLength(0);
  });

  it('reports an empty list on stdin', async () => {
    const { code, stderr } = await cli(['meta'], { stdin: '\n# only a comment\n' });
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('No URL on standard input');
  });
});

describe('meta', () => {
  it('prints a human summary by default', async () => {
    const { code, stdout, stderr } = await cli(['meta', 'https://ok.test/page']);
    expect(code).toBe(EXIT.ok);
    expect(stderr).toBe('');
    expect(stdout).toContain('Title of ok.test\n  https://ok.test/page\n  A page used by the tests.');
    expect(stdout).toContain('  Feeds      https://ok.test/feed.xml');
    expect(stdout).not.toContain('\u001b');
  });

  it('colours the summary on a terminal, unless NO_COLOR or --no-color', async () => {
    expect((await cli(['meta', 'https://ok.test'], { tty: true })).stdout).toContain('\u001b[1m');
    expect((await cli(['meta', 'https://ok.test'], { tty: true, env: { NO_COLOR: '1' } })).stdout).not.toContain('\u001b');
    expect((await cli(['meta', 'https://ok.test', '--no-color'], { tty: true })).stdout).not.toContain('\u001b');
    expect((await cli(['meta', 'https://ok.test', '--color'])).stdout).toContain('\u001b[1m');
  });

  it('never lets a page drive the terminal', async () => {
    const { stdout } = await cli(['meta', 'https://evil.test'], { tty: true, env: { NO_COLOR: '1' } });
    expect(stdout).not.toMatch(/[\u001b\u0007]/);
    expect(stdout).toContain('Evil[2J[31m title');
  });

  it('prints the full record with --json and maps the flags to API parameters', async () => {
    const { code, stdout } = await cli(['meta', 'https://ok.test', '--json', '--render', 'never', '--force', '--ttl', '120']);
    expect(code).toBe(EXIT.ok);
    const record = JSON.parse(stdout) as { url: string; ok: boolean; data: { title: string }; meta: { source: string } };
    expect(record).toMatchObject({ url: 'https://ok.test', ok: true, data: { title: 'Title of ok.test' }, meta: { source: 'http' } });
    expect(Object.fromEntries(stub.requests[0]?.query ?? [])).toEqual({ url: 'https://ok.test', render: 'never', force: 'true', ttl: '120' });
  });

  it('writes text output to --output', async () => {
    const { stdout } = await cli(['meta', 'https://ok.test', '--json', '-o', 'meta.json']);
    expect(stdout).toBe('');
    expect(JSON.parse(await readFile(join(workdir, 'meta.json'), 'utf8'))).toMatchObject({ ok: true });
  });
});

describe('API key', () => {
  const key = 'sk-test-0123456789abcdef';

  it('goes in the x-api-key header, never in the URL or the output', async () => {
    const fromEnv = await cli(['meta', 'https://ok.test', '--json'], { env: { OMNILLINK_API_KEY: key } });
    const fromFlag = await cli(['meta', 'https://ok.test', '--api-key', key]);
    expect(stub.requests.map((request) => request.headers['x-api-key'])).toEqual([key, key]);
    for (const request of stub.requests) expect(request.path).not.toContain(key);
    for (const output of [fromEnv, fromFlag]) expect(output.stdout + output.stderr).not.toContain(key);
  });

  it('is redacted from an error message that echoes it', async () => {
    const human = await cli(['meta', 'https://echo-key.test'], { env: { OMNILLINK_API_KEY: key } });
    const json = await cli(['meta', 'https://echo-key.test', '--json'], { env: { OMNILLINK_API_KEY: key } });
    expect(human.code).toBe(EXIT.api);
    expect(human.stderr).toContain('Unknown key [redacted]');
    expect(human.stdout + human.stderr + json.stdout + json.stderr).not.toContain(key);
  });

  it('is not sent to the default public instance by accident', async () => {
    const { code, stderr } = await cli(['meta', 'https://ok.test'], { noBaseUrl: true, env: { OMNILLINK_API_KEY: key } });
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('An API key is set but the instance is not');
    expect(stderr).not.toContain(key);
  });

  it('is not echoed when the flag has no value', async () => {
    const { code, stderr } = await cli(['meta', 'https://ok.test', '--api-key']);
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('--api-key expects a value: <key>');
  });
});

describe('exit codes', () => {
  it('3 for an error answered by the API', async () => {
    const { code, stdout, stderr } = await cli(['meta', 'https://forbidden.test']);
    expect(code).toBe(EXIT.api);
    expect(stdout).toBe('');
    expect(stderr).toContain('✗ EFORBIDDENURL (HTTP 403)\n  Destination refused by the SSRF policy');
  });

  it('3 with the record on stdout in --json mode', async () => {
    const { code, stdout, stderr } = await cli(['meta', 'https://rate.test', '--json']);
    expect(code).toBe(EXIT.api);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({
      url: 'https://rate.test',
      ok: false,
      error: { code: 'ERATELIMIT', status: 429, message: 'Too many requests', retryable: true, retryAfter: 7 },
    });
  });

  it('3 for an HTTP error that is not an Omnillink answer', async () => {
    const { code, stderr } = await cli(['meta', 'https://proxy.test']);
    expect(code).toBe(EXIT.api);
    expect(stderr).toContain('EHTTP (HTTP 502)');
  });

  it('4 when the instance cannot be reached', async () => {
    const { code, stderr } = await cli(['meta', 'https://ok.test', '--base-url', 'http://127.0.0.1:9']);
    expect(code).toBe(EXIT.network);
    expect(stderr).toContain('✗ ENETWORK');
  });

  it('4 on a client-side timeout', async () => {
    const { code, stderr } = await cli(['meta', 'https://slow.test', '--timeout', '5']);
    expect(code).toBe(EXIT.network);
    expect(stderr).toContain('✗ ETIMEOUT');
  });

  it('1 when the result cannot be written', async () => {
    const { code, stderr } = await cli(['shot', 'https://ok.test', '-o', 'missing-dir/shot.png']);
    expect(code).toBe(EXIT.failure);
    expect(stderr).toContain('ENOENT');
  });
});

describe('shot and pdf', () => {
  it('writes the image to --output and reports it', async () => {
    const { code, stdout } = await cli(['shot', 'https://ok.test', '-o', 'shot.png', '--device', 'mobile', '--full-page', '--color-scheme', 'dark', '--hide', '.a,#b', '--wait-for', '250']);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toContain('shot.png');
    expect(stdout).toContain('image/png, 70 B');
    expect(await readFile(join(workdir, 'shot.png'))).toEqual(PNG);
    expect(Object.fromEntries(stub.requests[0]?.query ?? [])).toEqual({
      url: 'https://ok.test',
      device: 'mobile',
      fullPage: 'true',
      colorScheme: 'dark',
      hide: '.a,#b',
      waitFor: '250',
    });
  });

  it('pipes the bytes untouched when stdout is not a terminal', async () => {
    const { code, bytes, stderr } = await cli(['pdf', 'https://ok.test', '--format', 'letter', '--no-print-background']);
    expect(code).toBe(EXIT.ok);
    expect(bytes).toEqual(PDF);
    expect(stderr).toBe('');
    expect(Object.fromEntries(stub.requests[0]?.query ?? [])).toEqual({ url: 'https://ok.test', format: 'Letter', printBackground: 'false' });
  });

  it('names the files of a batch after the URLs, inside --output-dir only', async () => {
    const urls = ['https://ok.test/a', 'https://ok.test/../../../etc/passwd', 'https://ok.test/..%2F..%2Fup'].join('\n');
    const { code, stdout } = await cli(['shot', '--output-dir', 'shots', '--format', 'jpeg', '--json'], { stdin: urls });
    expect(code).toBe(EXIT.ok);
    const records = stdout.trim().split('\n').map((line) => JSON.parse(line) as { file: string; type: string });
    const names = await readdir(join(workdir, 'shots'));
    expect(names).toHaveLength(3);
    for (const name of names) expect(name).toMatch(/^ok\.test[a-z0-9.-]*-[0-9a-f]{8}\.jpg$/);
    for (const record of records) {
      expect(record.file.startsWith(join(workdir, 'shots') + '/')).toBe(true);
      expect(record.type).toBe('image/jpeg');
    }
  });
});

describe('extract', () => {
  it('parses field rules', () => {
    expect(parseFieldRule('heading=h1')).toEqual(['heading', { selector: 'h1' }]);
    expect(parseFieldRule('links@href:url[]=nav a[href^="https://"]')).toEqual([
      'links',
      { selector: 'nav a[href^="https://"]', attr: 'href', type: 'url', all: true },
    ]);
    expect(parseFieldRule('price:number=.price')).toEqual(['price', { selector: '.price', type: 'number' }]);
    expect(parseFieldRule('body@html = article')).toEqual(['body', { selector: 'article', attr: 'html' }]);
    expect(() => parseFieldRule('bad name=h1')).toThrow(/before "="/);
    expect(() => parseFieldRule('x=')).toThrow(/selector is empty/);
  });

  it('merges --fields and --field, refusing duplicates', () => {
    const flags = new Map<string, string | readonly string[]>([
      ['fields', '{"a":{"selector":"h1"}}'],
      ['field', ['b:number=.b']],
    ]);
    expect(buildFields(flags)).toEqual({ a: { selector: 'h1' }, b: { selector: '.b', type: 'number' } });
    expect(() => buildFields(new Map<string, string | readonly string[]>([['fields', '{"a":{"selector":"h1"}}'], ['field', ['a=h2']]]))).toThrow(/defined twice/);
    expect(() => buildFields(new Map([['fields', '[1]']]))).toThrow(/JSON object/);
    expect(() => buildFields(new Map([['fields', '{oops']]))).toThrow(/not valid JSON/);
  });

  it('sends the rules and prints the fields', async () => {
    const { code, stdout } = await cli(['extract', 'https://ok.test', '-f', 'price:number=.price', '-f', 'links@href:url[]=a', '--render', 'always']);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toContain('  price  42\n  links  2 matches\n         - value of links');
    expect(JSON.parse(stub.requests[0]?.query.get('fields') ?? '')).toEqual({
      price: { selector: '.price', type: 'number' },
      links: { selector: 'a', attr: 'href', type: 'url', all: true },
    });
    expect(stub.requests[0]?.query.get('render')).toBe('always');
  });
});

describe('content', () => {
  it('prints the Markdown alone, ready to be redirected', async () => {
    const { code, stdout, stderr } = await cli(['content', 'https://ok.test']);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toBe('# Hello\n\nReadable **content** of ok.test.\n');
    expect(stderr).toBe('');
  });

  it('prints plain text with --text and a summary on a terminal', async () => {
    const { stdout, stderr } = await cli(['content', 'https://ok.test', '--text'], { tty: true, env: { NO_COLOR: '1' } });
    expect(stdout).toBe('Hello\n\nReadable content of ok.test.\n');
    expect(stderr).toBe('Hello · 5 words · 1 min read · https://ok.test\n');
  });
});

describe('batches from standard input', () => {
  it('answers in input order, as NDJSON, with a bounded number of requests in flight', async () => {
    const urls = Array.from({ length: 12 }, (_, index) => `https://slow${index}.test/`);
    const { code, stdout } = await cli(['meta', '--json', '--concurrency', '3'], { stdin: `# list\n\n${urls.join('\r\n')}\n` });
    expect(code).toBe(EXIT.ok);
    const lines = stdout.trim().split('\n');
    expect(lines.map((line) => (JSON.parse(line) as { url: string }).url)).toEqual(urls);
    expect(stub.requests).toHaveLength(12);
    expect(stub.maxInFlight).toBe(3);
  });

  it('defaults to 4 requests in flight and rejects an unreasonable --concurrency', async () => {
    const urls = Array.from({ length: 10 }, (_, index) => `https://slow${index}.test/`).join('\n');
    await cli(['meta', '--json', '-'], { stdin: urls });
    expect(stub.maxInFlight).toBe(4);
    expect((await cli(['meta', '--concurrency', '99'], { stdin: urls })).stderr).toContain('between 1 and 16');
  });

  it('keeps going after a failure and reports the worst outcome', async () => {
    const { code, stdout, stderr } = await cli(['meta'], { stdin: 'https://ok.test/1\nhttps://forbidden.test/\nnot a url\nhttps://ok.test/2\n' });
    expect(code).toBe(EXIT.api);
    expect(stdout).toContain('Title of ok.test');
    expect(stdout.match(/Title of ok\.test/g)).toHaveLength(2);
    expect(stderr).toContain('✗ EFORBIDDENURL (HTTP 403) https://forbidden.test/');
    expect(stderr).toContain('✗ EINVALIDURL (HTTP 400) not a url');
    expect(stderr).toContain('2 succeeded, 2 failed');
  });

  it('takes several URLs on the command line too', async () => {
    const { code, stdout } = await cli(['content', 'https://ok.test/1', 'https://ok.test/2']);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toBe(
      '<!-- source: https://ok.test/1 -->\n\n# Hello\n\nReadable **content** of ok.test.\n\n<!-- source: https://ok.test/2 -->\n\n# Hello\n\nReadable **content** of ok.test.\n',
    );
  });
});

describe('mapOrdered()', () => {
  it('pulls lazily, bounds the work and emits in order', async () => {
    let pulled = 0;
    let running = 0;
    let peak = 0;
    function* source(): Generator<number> {
      for (let index = 0; index < 20; index += 1) {
        pulled += 1;
        yield index;
      }
    }
    const seen: number[] = [];
    const total = await mapOrdered(
      source(),
      5,
      async (item) => {
        running += 1;
        peak = Math.max(peak, running);
        expect(pulled - seen.length).toBeLessThanOrEqual(5 * 4);
        await new Promise((done) => setTimeout(done, item === 0 ? 60 : 1));
        running -= 1;
        return item * 2;
      },
      (result) => {
        seen.push(result);
      },
    );
    expect(total).toBe(20);
    expect(peak).toBe(5);
    expect(seen).toEqual(Array.from({ length: 20 }, (_, index) => index * 2));
  });

  it('stops and rethrows when the worker throws', async () => {
    const started: number[] = [];
    await expect(
      mapOrdered([1, 2, 3, 4, 5, 6], 2, async (item) => {
        started.push(item);
        if (item === 2) throw new Error('boom');
        return item;
      }, () => undefined),
    ).rejects.toThrow('boom');
    expect(started.length).toBeLessThan(6);
  });
});
