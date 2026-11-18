/**
 * Allow-listed request headers, per-page limits, blocked downloads, the
 * circuit breaker, `/metrics`, structured logs and shared rate limiting.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/create-app.js';
import { CircuitBreaker } from '../src/lib/circuit-breaker.js';
import { AppError } from '../src/lib/errors.js';
import { Metrics } from '../src/lib/metrics.js';
import { parseTargetHeaders } from '../src/lib/target-headers.js';

let fixture: Server;
let origin: string;
let app: FastifyInstance;
const seen: Array<Record<string, string | undefined>> = [];
const logs: string[] = [];
const KEY = 'reliability-key-0123456789';
const TOKEN = 'metrics-token-0123456789abcdef';

const BASE_ENV = { NODE_ENV: 'test', SSRF_ALLOW_PRIVATE_NETWORKS: 'true', SSRF_ALLOWED_PORTS: '*', RATE_LIMIT_MAX: '1000' };

/** A port nothing listens on. */
async function closedPort(): Promise<number> {
  const probe = createTcpServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

beforeAll(async () => {
  fixture = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture').pathname;
    const html = (body: string) => res.writeHead(200, { 'content-type': 'text/html' }).end(body);
    if (path === '/echo') {
      const { 'accept-language': language, 'user-agent': agent, referer, cookie, authorization } = req.headers;
      seen.push({ language, agent, referer, cookie, authorization });
      html(`<html lang="en"><head><title>Echo</title></head><body><main><p id="language">${language ?? ''}</p><p id="agent">${agent ?? ''}</p><p id="referer">${referer ?? ''}</p><p id="cookie">${cookie ?? 'none'}</p></main></body></html>`);
    } else if (path === '/many') html(`<html><body><h1>Many</h1>${Array.from({ length: 60 }, (_, i) => `<img src="/px/${i}.png" width="1" height="1">`).join('')}</body></html>`);
    else if (path.startsWith('/px/')) res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    else if (path === '/heavy') html('<html><body><h1>Heavy</h1><script src="/blob.js"></script><script src="/after.js"></script></body></html>');
    else if (path === '/blob.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(`/*${'x'.repeat(600_000)}*/`);
    else if (path === '/after.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end('document.title="after"');
    else if (path === '/download') res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="a.zip"' }).end(Buffer.alloc(2048));
    else if (path === '/ok') html('<html><head><title>OK</title></head><body><p>fine</p></body></html>');
    else res.writeHead(404, { 'content-type': 'text/plain' }).end('nope');
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
  app = await buildApp(
    loadConfig({ ...BASE_ENV, API_KEYS: KEY, METRICS_TOKEN: TOKEN, LOG_LEVEL: 'info' }),
    { logStream: { write: (line) => void logs.push(line) } },
  );
});

afterAll(async () => {
  await app.close();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
});

const enc = encodeURIComponent;
const get = (path: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url: path, headers });
const FIELDS = enc('{"language":{"selector":"#language"},"agent":{"selector":"#agent"},"referer":{"selector":"#referer"},"cookie":{"selector":"#cookie"}}');
const echo = (query: string) => get(`/api/v1/extract?url=${enc(`${origin}/echo`)}&fields=${FIELDS}${query}`);

describe('allow-listed request headers', () => {
  const custom = `&acceptLanguage=${enc('fr-FR,fr;q=0.9')}&userAgent=${enc('OmnillinkTest/1.0 (+https://example.com/bot)')}&referer=${enc('https://news.example/front#top')}`;

  it('applies accept-language, user-agent and referer on the raw HTTP path', async () => {
    const res = await echo(`&render=never${custom}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().meta.source).toBe('http');
    expect(res.json().data.fields).toEqual({ language: 'fr-FR,fr;q=0.9', agent: 'OmnillinkTest/1.0 (+https://example.com/bot)', referer: 'https://news.example/front', cookie: 'none' });
  });

  it('applies the same three headers in the browser', async () => {
    const res = await echo(`&render=always${custom}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().meta.source).toBe('browser');
    expect(res.json().data.fields).toEqual({ language: 'fr-FR,fr;q=0.9', agent: 'OmnillinkTest/1.0 (+https://example.com/bot)', referer: 'https://news.example/front', cookie: 'none' });
    const shot = await get(`/api/v1/screenshot?url=${enc(`${origin}/echo`)}&width=320&height=240${custom}`);
    expect(shot.statusCode).toBe(200);
    expect(seen.at(-1)).toMatchObject({ language: 'fr-FR,fr;q=0.9', agent: 'OmnillinkTest/1.0 (+https://example.com/bot)', referer: 'https://news.example/front' });
  });

  it('makes them part of the cache key', async () => {
    const first = await echo(`&render=never&acceptLanguage=de`);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.json().data.fields.language).toBe('de');
    expect((await echo(`&render=never&acceptLanguage=de`)).headers['x-cache']).toBe('HIT');
    const other = await echo(`&render=never&acceptLanguage=es`);
    expect(other.headers['x-cache']).toBe('MISS');
    expect(other.json().data.fields.language).toBe('es');
    const plain = await echo('&render=never');
    expect(plain.headers['x-cache']).toBe('MISS');
    expect(plain.json().data.fields.language).toBe('en;q=0.9,*;q=0.5');
  });

  it('never forwards credentials and refuses anything that could split a header', async () => {
    const before = seen.length;
    const res = await get(`/api/v1/extract?url=${enc(`${origin}/echo`)}&fields=${FIELDS}&render=never&force=true&cookie=${enc('session=abc')}&authorization=${enc('Bearer x')}`, { cookie: 'session=caller', authorization: 'Bearer caller', 'x-api-key': KEY });
    expect(res.statusCode).toBe(200);
    expect(seen.length).toBe(before + 1);
    expect(seen.at(-1)).toMatchObject({ cookie: undefined, authorization: undefined });
    for (const bad of [
      `&userAgent=${enc('a\r\nX-Injected: 1')}`, `&userAgent=${enc('a\nb')}`, `&userAgent=${enc('é')}`, `&userAgent=${'x'.repeat(301)}`,
      `&acceptLanguage=${enc('fr\r\nCookie: a=b')}`, `&acceptLanguage=${enc('not a language!')}`, `&acceptLanguage=${enc('fr;q=7')}`,
      `&referer=${enc('javascript:alert(1)')}`, `&referer=${enc('https://user:pass@example.com/')}`, `&referer=nope`,
    ]) {
      const refused = await echo(`&render=never${bad}`);
      expect(refused.statusCode, bad).toBe(400);
      expect(refused.json().code).toBe('EINVALIDPARAMS');
    }
    expect(seen.length).toBe(before + 1);
    expect(parseTargetHeaders({})).toBeNull();
    expect(parseTargetHeaders({ acceptLanguage: ' en-US , fr;q=0.8 ' })).toEqual({ acceptLanguage: 'en-US , fr;q=0.8', userAgent: null, referer: null });
  });
});

describe('per-page limits', () => {
  it('drops requests past the request budget and reports it', async () => {
    const limited = await buildApp(loadConfig({ ...BASE_ENV, BROWSER_PAGE_MAX_REQUESTS: '20' }));
    try {
      const res = await limited.inject(`/api/v1/insights?url=${enc(`${origin}/many`)}`);
      expect(res.statusCode, res.body).toBe(200);
      const { network } = res.json().data;
      expect(network.limitReached).toBe('requests');
      expect(network.requests).toBeLessThanOrEqual(20);
      expect(network.requests).toBeGreaterThan(5);
      // The page is still captured with what it had.
      expect((await limited.inject(`/api/v1/screenshot?url=${enc(`${origin}/many`)}&width=320&height=240`)).statusCode).toBe(200);
    } finally {
      await limited.close();
    }
    const free = (await get(`/api/v1/insights?url=${enc(`${origin}/many`)}`)).json().data.network;
    expect(free).toMatchObject({ limitReached: null, requests: 61 });
    expect(free.byType.image.requests).toBe(60);
  });

  it('stops loading past the byte budget', async () => {
    const limited = await buildApp(loadConfig({ ...BASE_ENV, BROWSER_PAGE_MAX_BYTES: '100000' }));
    try {
      const res = await limited.inject(`/api/v1/insights?url=${enc(`${origin}/heavy`)}`);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().data.network.limitReached).toBe('bytes');
      const content = await limited.inject(`/api/v1/content?url=${enc(`${origin}/heavy`)}&render=always`);
      expect(content.statusCode).toBe(200);
      expect(content.json().data.text).toContain('Heavy');
    } finally {
      await limited.close();
    }
  });

  it('refuses downloads instead of writing a file', async () => {
    const res = await get(`/api/v1/screenshot?url=${enc(`${origin}/download`)}`);
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('ENOTHTML');
    expect((await get(`/api/v1/pdf?url=${enc(`${origin}/download`)}`)).json().code).toBe('ENOTHTML');
  });
});

describe('circuit breaker', () => {
  it('opens after consecutive network failures, per host, and recovers after the cooldown', async () => {
    const dead = `http://127.0.0.1:${await closedPort()}/`;
    const guarded = await buildApp(loadConfig({ ...BASE_ENV, CIRCUIT_BREAKER_THRESHOLD: '2', CIRCUIT_BREAKER_COOLDOWN_MS: '1000', METRICS_TOKEN: TOKEN }));
    try {
      const call = (url: string, path = 'meta') => guarded.inject(`/api/v1/${path}?url=${enc(url)}${path === 'meta' ? '&render=never' : ''}`);
      expect((await call(dead)).json().code).toBe('EUNREACHABLE');
      expect((await call(dead)).json().code).toBe('EUNREACHABLE');
      const open = await call(dead);
      expect(open.statusCode).toBe(503);
      expect(open.json()).toMatchObject({ status: 'error', code: 'ECIRCUITOPEN' });
      // Both paths share the verdict; another host is untouched.
      expect((await call(dead, 'screenshot')).json().code).toBe('ECIRCUITOPEN');
      expect((await call(`${origin}/ok`)).statusCode).toBe(200);
      const metrics = await guarded.inject({ url: '/metrics', headers: { authorization: `Bearer ${TOKEN}` } });
      expect(metrics.body).toMatch(/omnillink_circuit_open_hosts 1\n/);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      // Half-open: one trial goes out, fails, and the circuit opens again.
      expect((await call(dead)).json().code).toBe('EUNREACHABLE');
      expect((await call(dead)).json().code).toBe('ECIRCUITOPEN');
    } finally {
      await guarded.close();
    }
  });

  it('counts only network failures and closes on success', async () => {
    const breaker = new CircuitBreaker(2, 50);
    const url = new URL('https://flaky.example/');
    const fail = (error: Error) => breaker.run(url, () => Promise.reject(error)).catch((e: AppError) => e.code);
    // An HTTP error or a refusal is an answer, not an outage.
    expect(await fail(AppError.targetStatus(500))).toBe('ETARGETSTATUS');
    expect(await fail(AppError.forbiddenUrl('no'))).toBe('EFORBIDDENURL');
    expect(await fail(AppError.forbiddenUrl('no'))).toBe('EFORBIDDENURL');
    expect(await fail(AppError.timeout('slow'))).toBe('ETIMEOUT');
    expect(await breaker.run(url, async () => 'ok')).toBe('ok');
    expect(await fail(AppError.timeout('slow'))).toBe('ETIMEOUT');
    expect(await fail(AppError.unreachable('down'))).toBe('EUNREACHABLE');
    expect(await fail(AppError.unreachable('down'))).toBe('ECIRCUITOPEN');
    expect(breaker.openCount()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await breaker.run(url, async () => 'back')).toBe('back');
    expect(breaker.openCount()).toBe(0);
    expect(breaker.openedTotal).toBe(1);
    const off = new CircuitBreaker(0, 50);
    for (let i = 0; i < 5; i += 1) await off.run(url, () => Promise.reject(AppError.timeout('x'))).catch(() => undefined);
    expect(await off.run(url, async () => 1)).toBe(1);
  });
});

describe('GET /metrics', () => {
  it('requires the token and does not exist without one', async () => {
    expect((await get('/metrics')).statusCode).toBe(401);
    expect((await get('/metrics', { authorization: 'Bearer wrong-token-0123456789abcdef' })).json()).toMatchObject({ code: 'EUNAUTHORIZED' });
    expect((await get('/metrics', { authorization: TOKEN })).statusCode).toBe(401);
    const bare = await buildApp(loadConfig({ NODE_ENV: 'test' }));
    expect((await bare.inject('/metrics')).statusCode).toBe(404);
    await bare.close();
    expect(() => loadConfig({ NODE_ENV: 'test', METRICS_TOKEN: 'short' })).toThrow(/METRICS_TOKEN/);
  });

  it('exposes Prometheus text with bounded labels and nothing personal', async () => {
    await get(`/api/v1/meta?url=${enc(`${origin}/ok?secret=query-value-123`)}&render=never`, { 'x-api-key': KEY });
    await get(`/api/v1/meta?url=${enc(`${origin}/ok?secret=query-value-123`)}&render=never`);
    await get('/api/v1/does-not-exist?x=1');
    const res = await get('/metrics', { authorization: `Bearer ${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatch(/^# HELP omnillink_http_requests_total /);
    expect(res.body).toMatch(/omnillink_http_requests_total\{route="\/api\/v1\/meta",method="GET",status="200"\} \d+\n/);
    expect(res.body).toMatch(/omnillink_http_request_duration_seconds_bucket\{route="\/api\/v1\/meta",le="\+Inf"\} \d+\n/);
    expect(res.body).toMatch(/omnillink_cache_answers_total\{result="hit"\} [1-9]/);
    expect(res.body).toMatch(/omnillink_browser_jobs_active \d+\n/);
    expect(res.body).toMatch(/omnillink_process_resident_memory_bytes \d+\n/);
    for (const forbidden of ['query-value-123', KEY, TOKEN, '127.0.0.1', 'does-not-exist']) expect(res.body, forbidden).not.toContain(forbidden);
    // Every sample line is `name{labels} number`.
    for (const line of res.body.trim().split('\n')) {
      expect(line, line).toMatch(/^(?:# (?:HELP|TYPE) \w+ .+|\w+(?:\{[^}]*\})? -?\d+(?:\.\d+)?)$/);
    }
    const metrics = new Metrics();
    metrics.observe('/a"b\n', 'GET', 200, 0.2, null);
    expect(metrics.render()).toContain('route="/a\\"b\\n"');
  });
});

describe('structured logs', () => {
  it('writes one line per request with its id, and no personal data', async () => {
    logs.length = 0;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/meta?url=${enc(`${origin}/ok?email=jane.doe%40example.com&token=s3cr3t-value`)}&render=never`,
      headers: { 'x-api-key': KEY, 'x-request-id': 'trace-42', 'user-agent': 'PrivateBrowser/9', 'x-forwarded-for': '203.0.113.77', cookie: 'sid=private' },
      remoteAddress: '198.51.100.23',
    });
    expect(res.statusCode).toBe(200);
    const lines = logs.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line['reqId'] === 'trace-42');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ msg: 'request completed', route: '/api/v1/meta', method: 'GET', status: 200, source: 'http', keyed: true, targetHost: new URL(origin).host });
    expect(lines[0]!['durationMs']).toBeTypeOf('number');
    const raw = logs.join('\n');
    for (const personal of ['198.51.100.23', '203.0.113.77', 'jane.doe', 's3cr3t-value', KEY, 'PrivateBrowser', 'sid=private']) {
      expect(raw, personal).not.toContain(personal);
    }
    // A failure is logged with the same discipline.
    logs.length = 0;
    await app.inject({ method: 'GET', url: `/api/v1/meta?url=${enc(`${origin}/missing?token=s3cr3t-value`)}&render=never`, headers: { 'x-request-id': 'trace-43' }, remoteAddress: '198.51.100.23' });
    expect(logs.join('\n')).toContain('"reqId":"trace-43"');
    expect(logs.join('\n')).not.toMatch(/198\.51\.100\.23|s3cr3t-value/);
  });
});

const hasRedis = spawnSync('redis-server', ['--version']).status === 0;

describe.skipIf(!hasRedis)('rate limiting shared through Redis', () => {
  let redis: ChildProcess;
  let redisUrl: string;

  beforeAll(async () => {
    const port = await closedPort();
    redis = spawn('redis-server', ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('redis-server did not start')), 10_000);
      redis.stdout?.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('Ready to accept connections')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    redisUrl = `redis://127.0.0.1:${port}`;
  });

  afterAll(() => {
    redis?.kill('SIGKILL');
  });

  it('counts requests across instances, then fails open when Redis goes away', async () => {
    const env = { NODE_ENV: 'test', REDIS_URL: redisUrl, RATE_LIMIT_MAX: '3' };
    const [a, b] = [await buildApp(loadConfig(env)), await buildApp(loadConfig(env))];
    try {
      const hit = (instance: FastifyInstance) => instance.inject(`/api/v1/qr?url=${enc('https://example.com/')}`);
      // Let both limiter connections come up.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect((await a.inject('/health')).json()).toMatchObject({ cache: 'redis', rateLimit: 'redis' });
      expect((await hit(a)).headers['x-ratelimit-remaining']).toBe('2');
      expect((await hit(b)).headers['x-ratelimit-remaining']).toBe('1');
      expect((await hit(a)).headers['x-ratelimit-remaining']).toBe('0');
      const limited = await hit(b);
      expect(limited.statusCode).toBe(429);
      expect(limited.json().code).toBe('ERATELIMIT');

      redis.kill('SIGKILL');
      await new Promise((resolve) => setTimeout(resolve, 300));
      // The limiter is a protection, not a dependency.
      expect((await hit(a)).statusCode).toBe(200);
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
    const memory = await buildApp(loadConfig({ NODE_ENV: 'test' }));
    expect((await memory.inject('/health')).json().rateLimit).toBe('memory');
    await memory.close();
  });
});

describe('anti-SSRF policy on every new endpoint (production defaults)', () => {
  it('refuses internal destinations before any connection', async () => {
    const prod = await buildApp(loadConfig({ NODE_ENV: 'test', RATE_LIMIT_MAX: '1000' }));
    try {
      const endpoints = [
        'insights?', 'tech?render=never&', 'tech?render=always&', 'tables?', 'oembed?', 'favicon?', 'palette?', 'animation?',
        'extract?preset=article&', 'screenshot?click=a&', 'pdf?footerText=x&',
      ];
      const targets = ['http://169.254.169.254/latest/meta-data/', 'http://localhost:6379/', 'http://[::1]/', 'http://10.0.0.5/', 'http://0x7f.1/', 'https://example.com:22/'];
      for (const endpoint of endpoints) {
        for (const target of targets) {
          const res = await prod.inject(`/api/v1/${endpoint}url=${enc(target)}`);
          expect(res.statusCode, `${endpoint} ${target}`).toBe(403);
          expect(res.json().code).toBe('EFORBIDDENURL');
        }
      }
      expect((await prod.inject(`/api/v1/insights?url=${enc('file:///etc/passwd')}`)).json().code).toBe('EINVALIDURL');
    } finally {
      await prod.close();
    }
  });
});
