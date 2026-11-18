/**
 * Regressions found by walking real responses against the OpenAPI document:
 * `Retry-After` on the errors that ask to wait, rate-limit headers, the
 * headers of binary answers, `If-None-Match` on `/qr`, the code of an unknown
 * route, and data-only `<script>` blocks mistaken for running scripts.
 */
import { createServer, type Server } from 'node:http';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/create-app.js';
import { CircuitBreaker } from '../src/lib/circuit-breaker.js';
import { AppError, BUSY_RETRY_AFTER_SECONDS, ErrorCode } from '../src/lib/errors.js';
import { ERROR_CATALOG } from '../src/openapi.js';
import type { FetchedDocument, SafeFetcher } from '../src/services/fetcher.js';
import { hasExecutableScript, PageLoader } from '../src/services/page-loader.js';
import type { Renderer } from '../src/services/renderer.js';
import { Deadline } from '../src/lib/deadline.js';

const BASE_ENV = { NODE_ENV: 'test', SSRF_ALLOW_PRIVATE_NETWORKS: 'true', SSRF_ALLOWED_PORTS: '*', RATE_LIMIT_MAX: '1000' };
const enc = encodeURIComponent;

const PRODUCT_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Walnut desk',
  description: 'A small desk.',
  offers: { '@type': 'Offer', price: '249.00', priceCurrency: 'EUR' },
});
/** Short, script-free apart from its JSON-LD: the browser could add nothing to it. */
const STATIC_PRODUCT = `<html lang="en"><head><title>Walnut desk</title><script type="application/ld+json">${PRODUCT_LD}</script></head><body><h1>Walnut desk</h1><p>A small desk.</p></body></html>`;
/** The same page whose content is written by a script. */
const SCRIPTED_PRODUCT = `<html lang="en"><head><title>Walnut desk</title></head><body><div id="root"></div><script>document.getElementById('root').innerHTML = '<h1>Walnut desk</h1><a href="/rendered">rendered</a>';</script></body></html>`;

interface HeaderRefs {
  headers?: Record<string, { $ref?: string }>;
}
interface OpenApi {
  paths: Record<string, Record<string, { responses: Record<string, HeaderRefs> }>>;
  components: { headers: Record<string, { description: string; schema: { type: string; minimum?: number } }> };
  info: { description: string };
}

let fixture: Server;
let origin: string;
let app: FastifyInstance;
let doc: OpenApi;

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
    if (path === '/static-product') html(STATIC_PRODUCT);
    else if (path === '/scripted-product') html(SCRIPTED_PRODUCT);
    else res.writeHead(404, { 'content-type': 'text/plain' }).end('nope');
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
  app = await buildApp(loadConfig(BASE_ENV));
  doc = (await app.inject('/api/v1/openapi.json')).json();
});
afterAll(async () => {
  await app.close();
  await new Promise((resolve) => fixture.close(resolve));
});

const responsesOf = (path: string, method = 'get') => doc.paths[path]![method]!.responses;
const documentedHeaders = (path: string, status: string) => Object.keys(responsesOf(path)[status]!.headers ?? {});

describe('Retry-After', () => {
  it('is carried by the errors that ask to wait, as data', () => {
    expect(AppError.busy('saturated').retryAfterSeconds).toBe(BUSY_RETRY_AFTER_SECONDS);
    expect(AppError.circuitOpen('example.com', 17)).toMatchObject({ retryAfterSeconds: 17, statusCode: 503 });
    expect(AppError.timeout('late').retryAfterSeconds).toBeUndefined();
  });

  it('is set by the circuit breaker to the rest of the cooldown, at least 1 s', async () => {
    const breaker = new CircuitBreaker(1, 400);
    const url = new URL('https://down.example/');
    await breaker.run(url, () => Promise.reject(AppError.unreachable('down'))).catch(() => undefined);
    const open = await breaker.run(url, () => Promise.resolve('never')).catch((error: AppError) => error);
    expect(open).toMatchObject({ code: 'ECIRCUITOPEN', retryAfterSeconds: 1 });
  });

  it('is sent as a header with 503 ECIRCUITOPEN', async () => {
    const dead = `http://127.0.0.1:${await closedPort()}/`;
    const guarded = await buildApp(loadConfig({ ...BASE_ENV, CIRCUIT_BREAKER_THRESHOLD: '1', CIRCUIT_BREAKER_COOLDOWN_MS: '20000' }));
    try {
      const call = () => guarded.inject(`/api/v1/meta?url=${enc(dead)}&render=never`);
      const failed = await call();
      expect(failed.json().code).toBe('EUNREACHABLE');
      expect(failed.headers['retry-after']).toBeUndefined();
      const open = await call();
      expect(open.statusCode).toBe(503);
      expect(open.json().code).toBe('ECIRCUITOPEN');
      expect(open.headers['retry-after']).toMatch(/^\d+$/);
      const seconds = Number(open.headers['retry-after']);
      expect(seconds).toBeGreaterThanOrEqual(1);
      expect(seconds).toBeLessThanOrEqual(20);
      // The header and the message tell the same wait.
      expect(open.json().message).toContain(`retry in ${seconds} s`);
    } finally {
      await guarded.close();
    }
  });

  it('is sent as a header with 503 EBUSY when the rendering pool is saturated', async () => {
    const tight = await buildApp(loadConfig({ ...BASE_ENV, BROWSER_MAX_CONCURRENCY: '1', BROWSER_MAX_QUEUE: '0' }));
    try {
      // Different titles: identical requests would share one rendering job.
      const answers = await Promise.all(['One', 'Two'].map((title) => tight.inject(`/api/v1/og?title=${title}`)));
      const busy = answers.filter((answer) => answer.statusCode === 503);
      const served = answers.filter((answer) => answer.statusCode === 200);
      expect(busy).toHaveLength(1);
      expect(served).toHaveLength(1);
      expect(busy[0]!.json()).toMatchObject({ status: 'error', code: 'EBUSY' });
      expect(busy[0]!.headers['retry-after']).toBe(String(BUSY_RETRY_AFTER_SECONDS));
      // The winner doubles as the check that `/og` sends every header it documents.
      for (const name of documentedHeaders('/api/v1/og', '200')) expect(served[0]!.headers[name], name).toBeDefined();
      expect(served[0]!.headers['x-render-source']).toBe('browser');
    } finally {
      await tight.close();
    }
  });

  it('is documented on 429 and 503 answers only', () => {
    expect(doc.components.headers['retry-after']!.schema).toEqual({ type: 'integer', minimum: 1 });
    const meta = responsesOf('/api/v1/meta');
    expect(meta['503']!.headers!['retry-after']).toEqual({ $ref: '#/components/headers/retry-after' });
    expect(meta['429']!.headers!['retry-after']).toEqual({ $ref: '#/components/headers/retry-after' });
    for (const status of ['200', '304', '400', '401', '502', '504']) expect(meta[status]!.headers, status).not.toHaveProperty('retry-after');
    for (const code of [ErrorCode.Busy, ErrorCode.CircuitOpen, ErrorCode.RateLimited]) expect(ERROR_CATALOG[code].retryAfter, code).toBe(true);
  });
});

describe('rate-limit headers', () => {
  const NAMES = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];

  it('are declared as components and referenced on every answer of a rate-limited route', () => {
    for (const name of NAMES) {
      expect(doc.components.headers[name]!.schema.type, name).toBe('integer');
      expect(doc.components.headers[name]!.description, name).toBeTypeOf('string');
    }
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const operation of Object.values(item)) {
        for (const [status, response] of Object.entries(operation.responses)) {
          const names = Object.keys(response.headers ?? {});
          expect(names, `${path} ${status}`).toContain('x-request-id');
          // `/health` is the one documented route the limiter skips.
          if (path === '/health') expect(names, `${path} ${status}`).not.toContain('x-ratelimit-limit');
          else expect(names, `${path} ${status}`).toEqual(expect.arrayContaining(NAMES));
        }
      }
    }
  });

  it('match what the server sends, on successes, errors and 429', async () => {
    const limited = await buildApp(loadConfig({ ...BASE_ENV, RATE_LIMIT_MAX: '2' }));
    try {
      const qr = `/api/v1/qr?url=${enc('https://example.com/')}`;
      const ok = await limited.inject(qr);
      expect(ok.statusCode).toBe(200);
      expect(ok.headers).toMatchObject({ 'x-ratelimit-limit': '2', 'x-ratelimit-remaining': '1' });
      expect(ok.headers['x-ratelimit-reset']).toMatch(/^\d+$/);
      expect(ok.headers['retry-after']).toBeUndefined();
      const invalid = await limited.inject('/api/v1/qr');
      expect(invalid.statusCode).toBe(400);
      expect(invalid.headers).toMatchObject({ 'x-ratelimit-limit': '2', 'x-ratelimit-remaining': '0' });
      const refused = await limited.inject(qr);
      expect(refused.statusCode).toBe(429);
      for (const name of [...NAMES, 'retry-after']) expect(refused.headers[name], name).toMatch(/^\d+$/);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      const health = await limited.inject('/health');
      expect(health.statusCode).toBe(200);
      expect(health.headers['x-ratelimit-limit']).toBeUndefined();
    } finally {
      await limited.close();
    }
  });
});

describe('headers of binary answers', () => {
  it('documents x-render-source wherever the browser draws the answer', () => {
    for (const path of ['og', 'screenshot', 'pdf', 'animation']) {
      expect(documentedHeaders(`/api/v1/${path}`, '200'), path).toEqual(
        expect.arrayContaining(['x-cache', 'cache-control', 'x-render-source']),
      );
    }
    expect(documentedHeaders('/api/v1/animation', '200')).toContain('x-animation-frames');
    expect(documentedHeaders('/api/v1/pdf', '200')).toContain('content-disposition');
  });

  it('documents on /qr exactly the custom headers it sends', async () => {
    const res = await app.inject(`/api/v1/qr?url=${enc('https://example.com/')}`);
    for (const name of documentedHeaders('/api/v1/qr', '200')) expect(res.headers[name], name).toBeDefined();
    // Computed locally: no cache verdict and no rendering pipeline to report.
    expect(documentedHeaders('/api/v1/qr', '200')).not.toContain('x-render-source');
    expect(res.headers['x-render-source']).toBeUndefined();
    const cached = await app.inject({ url: `/api/v1/qr?url=${enc('https://example.com/')}`, headers: { 'if-none-match': String(res.headers['etag']) } });
    expect(cached.statusCode).toBe(304);
    for (const name of documentedHeaders('/api/v1/qr', '304')) expect(cached.headers[name], name).toBeDefined();
  });
});

describe('If-None-Match on /qr', () => {
  it('is compared like everywhere else: weak validators, lists and *', async () => {
    const url = `/api/v1/qr?url=${enc('https://example.com/a')}`;
    const etag = String((await app.inject(url)).headers['etag']);
    expect(etag).toMatch(/^"[\w-]+"$/);
    for (const header of [etag, `W/${etag}`, `"other", ${etag}`, `"other" , W/${etag}`, '*']) {
      const res = await app.inject({ url, headers: { 'if-none-match': header } });
      expect(res.statusCode, header).toBe(304);
      expect(res.body, header).toBe('');
      expect(res.headers['etag'], header).toBe(etag);
    }
    for (const header of ['"other"', 'W/"other", "another"', etag.slice(1, -1)]) {
      expect((await app.inject({ url, headers: { 'if-none-match': header } })).statusCode, header).toBe(200);
    }
  });
});

describe('unknown route', () => {
  it('answers 404 with its own code, not the 400 one', async () => {
    for (const request of [
      { method: 'GET', url: '/api/v1/nope?url=https://example.com' },
      { method: 'GET', url: '/nowhere' },
      { method: 'POST', url: '/api/v1/meta' },
    ] as const) {
      const res = await app.inject(request);
      expect(res.statusCode, request.url).toBe(404);
      expect(res.json(), request.url).toMatchObject({ status: 'fail', code: 'EROUTENOTFOUND' });
      expect(res.headers['x-request-id'], request.url).toBeTypeOf('string');
    }
    expect((await app.inject('/api/v1/nope?x=1')).json().message).toBe('Route GET /api/v1/nope not found');
  });

  it('is in the catalogue as a 404, and every code keeps one status', () => {
    expect(ERROR_CATALOG[ErrorCode.RouteNotFound].status).toBe(404);
    expect(ERROR_CATALOG[ErrorCode.InvalidParams].status).toBe(400);
    expect(doc.info.description).toContain('404 EROUTENOTFOUND');
  });
});

describe('data-only <script> blocks', () => {
  it('are not counted as scripts the page runs', () => {
    for (const type of ['application/ld+json', 'application/json', 'text/template', 'importmap', 'speculationrules', 'text/x-handlebars-template', 'APPLICATION/LD+JSON']) {
      expect(hasExecutableScript(`<html><body><script type="${type}">{}</script><p>x</p></body></html>`), type).toBe(false);
    }
    expect(hasExecutableScript('<html><body><p>no script at all</p></body></html>')).toBe(false);
    for (const tag of [
      '<script>x()</script>', '<script src="/a.js"></script>', '<script type="">x()</script>', '<script type="module" src="/a.js"></script>',
      '<script type="text/javascript">x()</script>', '<script type="application/javascript">x()</script>', '<SCRIPT TYPE="Text/JavaScript">x()</SCRIPT>',
      '<script type="text/javascript; charset=utf-8">x()</script>', '<script type="application/x-javascript">x()</script>', '<script type="text/ecmascript">x()</script>',
    ]) {
      expect(hasExecutableScript(`<html><body>${tag}</body></html>`), tag).toBe(true);
      // One running script is enough, whatever data sits next to it.
      expect(hasExecutableScript(`<html><body><script type="application/ld+json">{}</script>${tag}</body></html>`), tag).toBe(true);
    }
  });

  function loaderFor(html: string) {
    let renders = 0;
    const fetcher = {
      fetchDocument: async (target: URL): Promise<FetchedDocument> => ({ finalUrl: target.href, status: 200, contentType: 'text/html', html }),
    } as unknown as SafeFetcher;
    const renderer = {
      render: async () => {
        renders += 1;
        return { html: '<html><body>rendered</body></html>', url: 'https://example.com/', source: 'browser' as const };
      },
    } as unknown as Renderer;
    const loader = new PageLoader(loadConfig({ NODE_ENV: 'test' }), fetcher, renderer);
    // The caller's verdict is "not enough": only a running script can justify the browser.
    const load = () => loader.load(new URL('https://example.com/'), { render: 'auto', deadline: new Deadline(10_000), isSufficient: () => false });
    return { load, renders: () => renders };
  }

  it('keep a short JSON-LD-only page on the HTTP path, even when the caller wants more', async () => {
    const still = loaderFor(STATIC_PRODUCT);
    expect((await still.load()).source).toBe('http');
    expect(still.renders()).toBe(0);
    const scripted = loaderFor(SCRIPTED_PRODUCT);
    expect((await scripted.load()).source).toBe('browser');
    expect(scripted.renders()).toBe(1);
  });

  it('answer /extract, /links, /tables, /content and /tech from raw HTTP', async () => {
    const target = enc(`${origin}/static-product`);
    // `availability` and the rest are absent: the preset is incomplete, the page still static.
    const extract = await app.inject(`/api/v1/extract?url=${target}&preset=product`);
    expect(extract.statusCode, extract.body).toBe(200);
    expect(extract.json()).toMatchObject({ meta: { source: 'http' }, data: { fields: { name: 'Walnut desk', price: 249, currency: 'EUR' } } });
    expect(extract.headers['x-render-source']).toBe('http');
    const fields = await app.inject(`/api/v1/extract?url=${target}&fields=${enc('{"missing":{"selector":".nope"}}')}`);
    expect(fields.json()).toMatchObject({ meta: { source: 'http' }, data: { fields: { missing: null } } });
    // No link, no table, hardly any text: each would have asked for the browser.
    for (const path of ['links', 'tables', 'content', 'tech']) {
      const res = await app.inject(`/api/v1/${path}?url=${target}`);
      expect(res.statusCode, `${path} ${res.body}`).toBe(200);
      expect(res.json().meta.source, path).toBe('http');
    }
    expect((await app.inject(`/api/v1/tech?url=${target}&force=true`)).json().data.inspected.rendered).toBe(false);
  });

  it('still render a page whose content a script writes', async () => {
    const res = await app.inject(`/api/v1/links?url=${enc(`${origin}/scripted-product`)}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().meta.source).toBe('browser');
    expect(JSON.stringify(res.json().data)).toContain('/rendered');
  });
});
