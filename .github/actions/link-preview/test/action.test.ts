import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { escapeData, escapeText, getInput, outputRecord, renderSummary, run, safeUrl, screenshotName } from '../src/action.js';
import { PNG, startStub, type Stub } from './stub.js';

const bundle = fileURLToPath(new URL('../dist/index.mjs', import.meta.url));
const API_KEY = 'sk-test-0123456789abcdef';

let stub: Stub;
let temp: string;
let outputFile: string;
let summaryFile: string;

beforeAll(async () => {
  stub = await startStub();
  temp = await mkdtemp(join(tmpdir(), 'omnillink-action-'));
  outputFile = join(temp, 'output');
  summaryFile = join(temp, 'summary');
});
afterAll(async () => {
  await stub.close();
  await rm(temp, { recursive: true, force: true });
});
beforeEach(async () => {
  stub.requests.length = 0;
  await writeFile(outputFile, '');
  await writeFile(summaryFile, '');
});

const environment = (inputs: Record<string, string>): Record<string, string> => ({
  GITHUB_OUTPUT: outputFile,
  GITHUB_STEP_SUMMARY: summaryFile,
  RUNNER_TEMP: temp,
  'INPUT_BASE-URL': stub.baseUrl,
  ...Object.fromEntries(Object.entries(inputs).map(([name, value]) => [`INPUT_${name.toUpperCase()}`, value])),
});

async function action(inputs: Record<string, string>) {
  const lines: string[] = [];
  const code = await run({ env: environment(inputs), log: (line) => lines.push(line) });
  return { code, log: lines.join('\n'), outputs: parseOutputs(await readFile(outputFile, 'utf8')), summary: await readFile(summaryFile, 'utf8') };
}

/** Reads the `name<<delimiter` records back, as the runner does. */
function parseOutputs(file: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  const lines = file.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([\w-]+)<<(.+)$/.exec(lines[index] ?? '');
    if (match === null) continue;
    const [, name = '', delimiter = ''] = match;
    const end = lines.indexOf(delimiter, index + 1);
    outputs[name] = lines.slice(index + 1, end).join('\n');
    index = end;
  }
  return outputs;
}

describe('helpers', () => {
  it('reads inputs the way the runner exports them', () => {
    expect(getInput({ 'INPUT_BASE-URL': ' https://x.test ' }, 'base-url')).toBe('https://x.test');
    expect(getInput({}, 'url')).toBe('');
  });

  it('neutralises Markdown and HTML in summary text', () => {
    const escaped = escapeText('<img src=x onerror=alert(1)> **bold** [x](javascript:alert(1)) @octocat `code`\n\n# h1');
    expect(escaped.replace(/&#\d+;/g, '')).not.toMatch(/[<>*[\]()`@#&]/);
    expect(escaped).not.toContain('\n');
    expect(escaped).toContain('&#60;img src&#61;x onerror&#61;alert&#40;1&#41;&#62;');
    expect(escapeText('x'.repeat(600))).toHaveLength(500);
  });

  it('lets only clean http(s) URLs into attributes', () => {
    expect(safeUrl('https://example.com/a?b=1&c="2"')).toBe('https://example.com/a?b=1&#38;c=%222%22');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl('https://user:pw@example.com/')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });

  it('writes outputs that a value cannot break out of', () => {
    const record = outputRecord('title', 'line 1\nok<<EOF\nfake=1\nEOF');
    const [first = '', ...rest] = record.trimEnd().split('\n');
    const delimiter = first.replace('title<<', '');
    expect(delimiter).toMatch(/^ghadelimiter_[0-9a-f-]{36}$/);
    expect(rest.at(-1)).toBe(delimiter);
    expect(rest.slice(0, -1).join('\n')).toBe('line 1\nok<<EOF\nfake=1\nEOF');
  });

  it('escapes workflow command data', () => {
    expect(escapeData('50%\r\n::set-output name=x::y')).toBe('50%25%0D%0A::set-output name=x::y');
  });

  it('names screenshots with plain file names', () => {
    for (const url of ['https://example.com/../../etc/passwd', 'https://example.com/..%2f..%2fx', 'https://example.com/a\\..\\b']) {
      expect(screenshotName(url, 'png')).toMatch(/^example\.com[a-z0-9.-]*-[0-9a-f]{8}\.png$/);
      expect(screenshotName(url, 'png')).not.toContain('..');
    }
  });

  it('renders a summary that page metadata cannot script', () => {
    const html = renderSummary({
      url: 'https://example.com/',
      data: {
        url: 'https://example.com/',
        canonicalUrl: 'javascript:alert(1)',
        title: '</h3><script>alert(1)</script>',
        description: '![x](https://evil.test/track.png) <b>bold</b>',
        author: null,
        publisher: '@everyone',
        lang: 'en',
        date: null,
        image: { url: 'javascript:alert(2)', width: null, height: null, type: null, alt: null },
        images: [],
        favicon: null,
        logo: null,
        video: null,
        audio: null,
        keywords: [],
        feeds: [],
        jsonLd: [],
        contentType: 'text/html',
      },
      meta: { cached: true, source: 'http', durationMs: 1 },
      screenshotUrl: null,
      screenshotPath: null,
      screenshotError: null,
    });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('@everyone');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/\n\n/);
    expect(html).toContain('<tr><th align="left">URL</th><td><a href="https://example.com/">');
  });
});

describe('run()', () => {
  it('writes the outputs and a summary', async () => {
    const { code, outputs, summary, log } = await action({ url: 'https://ok.test/page', render: 'never' });
    expect(code).toBe(0);
    expect(outputs).toMatchObject({
      ok: 'true',
      'error-code': '',
      title: 'Title of ok.test',
      description: 'A page used by the tests.',
      image: 'https://img.test/cover.png',
      'canonical-url': 'https://ok.test/page',
      publisher: 'Example',
      'screenshot-path': '',
    });
    expect(JSON.parse(outputs['metadata'] ?? '')).toMatchObject({ title: 'Title of ok.test', lang: 'en' });
    expect(summary).toContain('<h3>🔗 Title of ok.test</h3>');
    expect(summary).toContain('<img src="https://img.test/cover.png" alt="" width="480">');
    expect(summary).toContain('<tr><th align="left">Publisher</th><td>Example</td></tr>');
    expect(log).toBe('Fetching the metadata of https://ok.test/page\nDone');
    expect(Object.fromEntries(stub.requests[0]?.query ?? [])).toEqual({ url: 'https://ok.test/page', render: 'never' });
  });

  it('saves a screenshot and embeds it when the instance is anonymous', async () => {
    const { outputs, summary } = await action({ url: 'https://ok.test/', screenshot: 'true', device: 'mobile', 'full-page': 'true' });
    const path = outputs['screenshot-path'] ?? '';
    expect(dirname(path)).toBe(join(temp, 'omnillink-link-preview'));
    expect(await readFile(path)).toEqual(PNG);
    expect(summary).toContain(`<img src="${stub.baseUrl}/api/v1/screenshot?url=https%3A%2F%2Fok.test%2F&#38;device=mobile&#38;fullPage=true" alt="Screenshot of the page" width="720">`);
    expect(Object.fromEntries(stub.requests[1]?.query ?? [])).toEqual({ url: 'https://ok.test/', device: 'mobile', fullPage: 'true' });
  });

  it('keeps the API key out of the log, the outputs, the summary and every URL', async () => {
    const { code, log, outputs, summary } = await action({ url: 'https://ok.test/', 'api-key': API_KEY, screenshot: 'true' });
    expect(code).toBe(0);
    expect(stub.requests.map((request) => request.headers['x-api-key'])).toEqual([API_KEY, API_KEY]);
    for (const request of stub.requests) expect(request.path).not.toContain(API_KEY);
    // The only mention is the command that tells the runner to mask it.
    expect(log.split('\n').filter((line) => line.includes(API_KEY))).toEqual([`::add-mask::${API_KEY}`]);
    expect(log.split('\n')[0]).toBe(`::add-mask::${API_KEY}`);
    expect(JSON.stringify(outputs) + summary).not.toContain(API_KEY);
    // No public image URL with a key-protected instance: the path is given instead.
    expect(summary).not.toContain('/api/v1/screenshot');
    expect(summary).toContain('actions/upload-artifact');
  });

  it('redacts a key echoed by an error', async () => {
    const { code, log, summary } = await action({ url: 'https://echo-key.test/', 'api-key': API_KEY });
    expect(code).toBe(1);
    expect(log).toContain('::error title=Omnillink EUNAUTHORIZED::Unknown key ***');
    expect(summary).not.toContain(API_KEY);
  });

  it('fails the step on an API error, with the code as an output', async () => {
    const { code, outputs, summary, log } = await action({ url: 'https://forbidden.test/' });
    expect(code).toBe(1);
    expect(outputs).toMatchObject({ ok: 'false', 'error-code': 'EFORBIDDENURL', title: '' });
    expect(log).toContain('::error title=Omnillink EFORBIDDENURL::Destination refused by the SSRF policy');
    expect(summary).toContain('Link preview unavailable');
  });

  it('only warns with fail-on-error: false', async () => {
    const { code, outputs, log } = await action({ url: 'https://rate.test/', 'fail-on-error': 'false' });
    expect(code).toBe(0);
    expect(outputs).toMatchObject({ ok: 'false', 'error-code': 'ERATELIMIT' });
    expect(log).toContain('::warning title=Omnillink ERATELIMIT::');
  });

  it.each([
    [{ url: 'javascript:alert(1)' }, 'Input "url" must be an absolute http(s) URL'],
    [{ url: 'https://ok.test/', screenshot: 'yes' }, 'Input "screenshot" must be "true" or "false"'],
    [{ url: 'https://ok.test/', render: 'sometimes' }, 'Input "render" must be one of: auto, never, always'],
    [{ url: 'https://ok.test/', 'base-url': 'https://user:pw@x.test' }, 'Input "base-url" must be an absolute http(s) URL, without credentials'],
  ])('rejects the inputs %j before any request', async (inputs, message) => {
    const { code, log, outputs } = await action({ ...inputs, 'fail-on-error': 'false' });
    expect(code).toBe(1);
    expect(log).toContain(`::error title=Omnillink EINPUT::${message}`);
    expect(outputs['error-code']).toBe('EINPUT');
    expect(stub.requests).toHaveLength(0);
  });

  it('treats a URL full of shell and workflow syntax as plain data', async () => {
    const url = 'https://ok.test/$(touch pwned)`id`;"\'%0A::set-output name=ok::hacked';
    const { code, log, outputs } = await action({ url });
    expect(code).toBe(0);
    expect(stub.requests[0]?.query.get('url')).toBe(url);
    for (const line of log.split('\n')) expect(line).not.toMatch(/^::(?!add-mask)/);
    expect(outputs['ok']).toBe('true');
  });

  it('skips the summary when asked to', async () => {
    const { summary } = await action({ url: 'https://ok.test/', summary: 'false' });
    expect(summary).toBe('');
  });

  it('keeps the metadata when only the screenshot fails', async () => {
    // The stub answers 404 on any route it does not know: here, with a broken render pool.
    const lines: string[] = [];
    const code = await run({
      env: environment({ url: 'https://ok.test/', screenshot: 'true' }),
      log: (line) => lines.push(line),
      fetch: (input, init) =>
        String(input).includes('/screenshot')
          ? Promise.resolve(new Response(JSON.stringify({ status: 'error', code: 'EBUSY', message: 'Render pool is full' }), { status: 503 }))
          : fetch(input, init),
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('::warning title=Omnillink::No screenshot: EBUSY: Render pool is full');
    expect(parseOutputs(await readFile(outputFile, 'utf8'))).toMatchObject({ ok: 'true', 'screenshot-path': '' });
    expect(await readFile(summaryFile, 'utf8')).toContain('No screenshot');
  });
});

describe('dist/index.mjs, as the runner executes it', () => {
  it('runs standalone and exits 0', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [bundle], {
      env: { PATH: process.env['PATH'] ?? '', ...environment({ url: 'https://ok.test/bundle' }) },
      cwd: temp,
    });
    expect(stdout).toBe('Fetching the metadata of https://ok.test/bundle\nDone\n');
    expect(parseOutputs(await readFile(outputFile, 'utf8'))['title']).toBe('Title of ok.test');
  });

  it('exits 1 on failure', async () => {
    const failure = await promisify(execFile)(process.execPath, [bundle], {
      env: { PATH: process.env['PATH'] ?? '', ...environment({ url: 'https://forbidden.test/' }) },
    }).catch((error: { code: number; stdout: string }) => error);
    expect(failure).toMatchObject({ code: 1 });
    expect((failure as { stdout: string }).stdout).toContain('::error title=Omnillink EFORBIDDENURL::');
  });
});
