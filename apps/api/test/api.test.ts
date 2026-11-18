/**
 * End-to-end tests: a real Fastify app, a real Chromium, and a local fixture
 * site. Private networks are allowed here (and only here) to reach the fixture.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const STATIC_PAGE = `<!doctype html><html lang="en"><head>
  <title>Static page</title>
  <meta property="og:title" content="Static OG title">
  <meta property="og:description" content="A server-rendered page">
  <meta property="og:image" content="/cover.png">
  <meta name="author" content="Grace Hopper">
  <link rel="icon" href="/icon.svg">
  <script type="application/ld+json">{"@type":"WebPage","name":"Static"}</script>
</head><body><h1>Hello</h1><p>${'Lorem ipsum dolor sit amet. '.repeat(20)}</p></body></html>`;

/** An empty shell whose metadata only exists after JavaScript runs. */
const SPA_PAGE = `<!doctype html><html><head><title>Loading…</title></head><body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body></html>`;

const SPA_SCRIPT = `
  document.title = 'Rendered title';
  const m = document.createElement('meta');
  m.setAttribute('property', 'og:description');
  m.setAttribute('content', 'Injected by JavaScript');
  document.head.appendChild(m);
  document.getElementById('root').textContent = 'Client-side content';
`;

let fixture: Server;
let origin: string;
let app: FastifyInstance;
let staticHits = 0;

beforeAll(async () => {
  fixture = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture').pathname;
    if (path === '/static') {
      staticHits += 1;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(STATIC_PAGE);
    } else if (path === '/spa') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(SPA_PAGE);
    } else if (path === '/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' }).end(SPA_SCRIPT);
    } else if (path === '/redirect') {
      res.writeHead(302, { location: '/static' }).end();
    } else if (path === '/slow') {
      // Never answers: exercises the timeout path.
    } else {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not found</h1>');
    }
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;

  app = await buildApp(
    loadConfig({
      NODE_ENV: 'test',
      SSRF_ALLOW_PRIVATE_NETWORKS: 'true',
      SSRF_ALLOWED_PORTS: '*',
      HTTP_TIMEOUT_MS: '1500',
      RATE_LIMIT_MAX: '1000',
    }),
  );
});

afterAll(async () => {
  await app.close();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
});

const get = (path: string) => app.inject({ method: 'GET', url: path });
const enc = encodeURIComponent;

describe('GET /api/v1/meta', () => {
  it('extracts metadata over plain HTTP and caches the result', async () => {
    const first = await get(`/api/v1/meta?url=${enc(`${origin}/static`)}`);
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    const body = first.json();
    expect(body.meta.source).toBe('http');
    expect(body.data).toMatchObject({
      title: 'Static OG title',
      description: 'A server-rendered page',
      author: 'Grace Hopper',
      favicon: `${origin}/icon.svg`,
      image: { url: `${origin}/cover.png` },
      jsonLd: [{ '@type': 'WebPage', name: 'Static' }],
    });

    const second = await get(`/api/v1/meta?url=${enc(`${origin}/static`)}`);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.json().meta.cached).toBe(true);
    expect(staticHits).toBe(1);
  });

  it('follows redirects and reports the final URL', async () => {
    const res = await get(`/api/v1/meta?url=${enc(`${origin}/redirect`)}`);
    expect(res.json().data.url).toBe(`${origin}/static`);
  });

  it('falls back to the browser for client-side-rendered pages', async () => {
    const res = await get(`/api/v1/meta?url=${enc(`${origin}/spa`)}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.source).toBe('browser');
    expect(body.data.title).toBe('Rendered title');
    expect(body.data.description).toBe('Injected by JavaScript');
  });

  it('does not use the browser when render=never', async () => {
    const res = await get(`/api/v1/meta?url=${enc(`${origin}/spa`)}&render=never`);
    expect(res.json().meta.source).toBe('http');
    expect(res.json().data.title).toBe('Loading…');
  });

  it('rejects a missing or invalid url with 400', async () => {
    expect((await get('/api/v1/meta')).json()).toMatchObject({ code: 'EINVALIDPARAMS' });
    const bad = await get(`/api/v1/meta?url=${enc('ftp://example.com')}`);
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ status: 'fail', code: 'EINVALIDURL' });
  });

  it('reports target HTTP errors as 502', async () => {
    const res = await get(`/api/v1/meta?url=${enc(`${origin}/missing`)}`);
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('ETARGETSTATUS');
  });

  it('reports timeouts as 504', async () => {
    const res = await get(`/api/v1/meta?url=${enc(`${origin}/slow`)}&render=never`);
    expect(res.statusCode).toBe(504);
    expect(res.json().code).toBe('ETIMEOUT');
  });

  it('reports a down site as 502', async () => {
    const res = await get(`/api/v1/meta?url=${enc('http://127.0.0.1:1/')}`);
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('EUNREACHABLE');
  });
});

describe('GET /api/v1/screenshot', () => {
  const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

  it('captures a desktop PNG', async () => {
    const res = await get(`/api/v1/screenshot?url=${enc(`${origin}/static`)}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.subarray(1, 4).toString()).toBe('PNG');
    expect(pngSize(res.rawPayload)).toEqual({ width: 1280, height: 800 });
  });

  it('captures a mobile viewport', async () => {
    const res = await get(`/api/v1/screenshot?url=${enc(`${origin}/static`)}&device=mobile`);
    expect(res.statusCode).toBe(200);
    const { width, height } = pngSize(res.rawPayload);
    expect(width).toBeLessThan(1280);
    expect(height).toBeGreaterThan(width);
  });

  it('supports JPEG output and serves repeats from the cache', async () => {
    const path = `/api/v1/screenshot?url=${enc(`${origin}/static`)}&format=jpeg&quality=60`;
    const first = await get(path);
    expect(first.headers['content-type']).toBe('image/jpeg');
    expect(first.rawPayload.readUInt16BE(0)).toBe(0xffd8);
    expect((await get(path)).headers['x-cache']).toBe('HIT');
  });

  it('rejects an unknown device', async () => {
    const res = await get(`/api/v1/screenshot?url=${enc(`${origin}/static`)}&device=watch`);
    expect(res.statusCode).toBe(400);
  });
});

describe('SSRF protection (strict policy)', () => {
  let strictApp: FastifyInstance;

  beforeAll(async () => {
    strictApp = await buildApp(loadConfig({ NODE_ENV: 'test' }));
  });
  afterAll(() => strictApp.close());

  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://2130706433/',
  ])('refuses %s on both endpoints', async (target) => {
    for (const endpoint of ['meta', 'screenshot']) {
      const res = await strictApp.inject(`/api/v1/${endpoint}?url=${enc(target)}`);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('EFORBIDDENURL');
    }
  });
});

describe('GET /health', () => {
  it('reports pool statistics', async () => {
    const res = await get('/health');
    expect(res.json()).toMatchObject({ status: 'ok', cache: 'memory' });
  });
});
