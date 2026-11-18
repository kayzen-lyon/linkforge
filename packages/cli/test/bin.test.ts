/**
 * The built executable, as a user runs it: a real child process, real pipes.
 * `npm test` builds first (see `pretest`).
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PNG, startStub, type Stub } from './stub.js';

const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const exec = promisify(execFile);

let stub: Stub;
beforeAll(async () => {
  stub = await startStub();
});
afterAll(() => stub.close());

function pipe(args: string[], input: string, env: Record<string, string>): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [bin, ...args], { env: { PATH: process.env['PATH'] ?? '', ...env } });
    const out: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout: Buffer.concat(out), stderr }));
    child.stdin.end(input);
  });
}

describe('dist/bin.js', () => {
  it('has been built', () => {
    expect(existsSync(bin)).toBe(true);
  });

  it('prints its version', async () => {
    const { stdout } = await exec(process.execPath, [bin, '--version']);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it('reads URLs from a pipe and exits 0', async () => {
    const { code, stdout, stderr } = await pipe(['meta', '--json'], 'https://ok.test/a\nhttps://ok.test/b\n', { OMNILLINK_URL: stub.baseUrl });
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(stdout.toString().trim().split('\n')).toHaveLength(2);
  });

  it('pipes a screenshot byte for byte', async () => {
    const { code, stdout } = await pipe(['shot', 'https://ok.test'], '', { OMNILLINK_URL: stub.baseUrl });
    expect(code).toBe(0);
    expect(stdout).toEqual(PNG);
  });

  it('exits 2, 3 and 4 for usage, API and network errors', async () => {
    const env = { OMNILLINK_URL: stub.baseUrl };
    expect((await pipe(['meta', '--nope', 'https://ok.test'], '', env)).code).toBe(2);
    expect((await pipe(['meta', 'https://forbidden.test'], '', env)).code).toBe(3);
    expect((await pipe(['meta', 'https://ok.test'], '', { OMNILLINK_URL: 'http://127.0.0.1:9' })).code).toBe(4);
  });
});
