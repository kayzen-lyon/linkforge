/**
 * `/links`, `/check`, `/sitemap`, `/tech`: local fixtures only.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/create-app.js';
import { readImageHeader } from '../src/lib/image-header.js';
import { extractLinks } from '../src/services/link-extractor.js';
import { parseRobotsSitemaps, parseSitemap } from '../src/services/sitemap-parser.js';
import { detectTechnologies } from '../src/services/tech-detector.js';

const LINKS_PAGE = `<!doctype html><html><head><title>Links</title></head><body>
  <a href="/about">About us</a> <a href="/about#team">Team</a> <a href="https://www.partner.org/x" rel="NoFollow noopener">Partner</a>
  <a href="mailto:a@b.c">Mail</a> <a href="javascript:void(0)">JS</a> <a href="//cdn.other.net/f.pdf" rel="sponsored"><img src="i.png" alt="Download"></a>
  <a href="/empty" title="Titled"></a><a href="">Self</a>
</body></html>`;

const urlset = (paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .map((p, i) => `<url><loc>ORIGIN${p}</loc>${i === 0 ? '<lastmod>2026-01-02</lastmod>' : ''}</url>`)
    .join('')}</urlset>`;

let fixture: Server;
let internal: Server;
let internalHits = 0;
let origin: string;
let app: FastifyInstance;
let robots = '';

beforeAll(async () => {
  internal = createServer((_req, res) => {
    internalHits += 1;
    res.end('SECRET');
  });
  await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve));
  const internalPort = (internal.address() as AddressInfo).port;

  fixture = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture').pathname;
    const xml = (body: string) => res.writeHead(200, { 'content-type': 'application/xml' }).end(body.replaceAll('ORIGIN', origin));
    if (path === '/links') res.writeHead(200, { 'content-type': 'text/html' }).end(LINKS_PAGE);
    else if (path === '/hop1') res.writeHead(301, { location: '/hop2' }).end();
    else if (path === '/hop2') res.writeHead(302, { location: '/links' }).end();
    else if (path === '/gone') res.writeHead(410, { 'content-type': 'text/plain', 'content-length': '4' }).end('gone');
    else if (path === '/to-internal') res.writeHead(302, { location: `http://127.0.0.1:${internalPort}/` }).end();
    else if (path === '/robots.txt' && robots !== '') res.writeHead(200, { 'content-type': 'text/plain' }).end(robots.replaceAll('ORIGIN', origin));
    else if (path === '/sitemap.xml') xml(urlset(['/', '/a']));
    else if (path === '/index.xml') xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>ORIGIN/posts.xml.gz</loc></sitemap><sitemap><loc>ORIGIN/missing.xml</loc></sitemap><sitemap><loc>http://127.0.0.1:${internalPort}/s.xml</loc></sitemap></sitemapindex>`);
    else if (path === '/posts.xml.gz') res.writeHead(200, { 'content-type': 'application/gzip' }).end(gzipSync(urlset(['/p1', '/p2', '/p3']).replaceAll('ORIGIN', origin)));
    else if (path === '/pixel.png') {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(png.length) }).end(png);
    } else if (path === '/with-image') res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><meta property="og:image" content="/pixel.png"></head><body>x</body></html>');
    else if (path === '/spa') res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><title>S</title></head><body><div id="root"></div><script>document.getElementById("root").innerHTML = "<b id=\\"done\\">RENDERED</b>";</script></body></html>');
    else if (path === '/wp') {
      res.writeHead(200, { 'content-type': 'text/html', server: 'nginx/1.25', 'x-powered-by': 'PHP/8.2', 'set-cookie': ['PHPSESSID=abc; Path=/'] }).end(
        `<html><head><meta name="generator" content="WordPress 6.6"><script src="/wp-includes/js/jquery/jquery.min.js"></script>
         <script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script></head><body><div id="__next"></div></body></html>`,
      );
    } else res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not found</h1>');
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
  app = await buildApp(
    loadConfig({
      NODE_ENV: 'test',
      SSRF_ALLOW_PRIVATE_NETWORKS: 'true',
      SSRF_ALLOWED_PORTS: '*',
      SSRF_BLOCKED_HOSTS: `127.0.0.1:${internalPort}`,
      RATE_LIMIT_MAX: '1000',
    }),
  );
});

afterAll(async () => {
  await app.close();
  for (const server of [fixture, internal]) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

const enc = encodeURIComponent;
const get = (path: string) => app.inject({ method: 'GET', url: path });
const target = (path: string) => enc(`${origin}${path}`);

describe('GET /api/v1/links', () => {
  it('lists absolute, de-duplicated links with text, rel and scope', async () => {
    const res = await get(`/api/v1/links?url=${target('/links')}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    const { data, meta } = res.json();
    expect(meta.source).toBe('http');
    expect(data).toMatchObject({ url: `${origin}/links`, total: 4, internal: 2, external: 2, truncated: false });
    expect(data.links).toEqual([
      { url: `${origin}/about`, text: 'About us', rel: [], internal: true, nofollow: false },
      { url: 'https://www.partner.org/x', text: 'Partner', rel: ['nofollow', 'noopener'], internal: false, nofollow: true },
      { url: 'http://cdn.other.net/f.pdf', text: 'Download', rel: ['sponsored'], internal: false, nofollow: true },
      { url: `${origin}/empty`, text: 'Titled', rel: [], internal: true, nofollow: false },
    ]);
  });

  it('applies scope and limit, and validates them', async () => {
    const external = (await get(`/api/v1/links?url=${target('/links')}&scope=external&limit=1`)).json().data;
    expect(external.links).toHaveLength(1);
    expect(external).toMatchObject({ total: 4, truncated: true });
    expect((await get(`/api/v1/links?url=${target('/links')}&limit=0`)).statusCode).toBe(400);
    expect((await get(`/api/v1/links?url=${target('/links')}&scope=some`)).statusCode).toBe(400);
    expect(extractLinks('<a href="/a">x</a>', 'https://www.example.com/', 'all', 10).links[0]?.internal).toBe(true);
  });
});

describe('GET /api/v1/check', () => {
  it('reports every hop with status and timing, and is never cached', async () => {
    const res = await get(`/api/v1/check?url=${target('/hop1')}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { data } = res.json();
    expect(data).toMatchObject({ url: `${origin}/hop1`, finalUrl: `${origin}/links`, ok: true, status: 200, contentType: 'text/html', tls: null });
    expect(data.redirects.map((hop: { status: number; location: string | null }) => [hop.status, hop.location])).toEqual([
      [301, `${origin}/hop2`],
      [302, `${origin}/links`],
      [200, null],
    ]);
    for (const hop of data.redirects) expect(hop.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a target error as a result, and refuses forbidden hops', async () => {
    const gone = (await get(`/api/v1/check?url=${target('/gone')}`)).json().data;
    expect(gone).toMatchObject({ ok: false, status: 410, contentLength: 4 });

    const forbidden = await get(`/api/v1/check?url=${target('/to-internal')}`);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe('EFORBIDDENURL');
    expect(internalHits).toBe(0);
    expect((await get('/api/v1/check?url=ftp%3A%2F%2Fx')).json().code).toBe('EINVALIDURL');
  });
});

describe('GET /api/v1/sitemap', () => {
  it('falls back to /sitemap.xml when robots.txt is missing', async () => {
    robots = '';
    const { data } = (await get(`/api/v1/sitemap?url=${target('/some/page')}`)).json();
    expect(data).toMatchObject({ robotsFound: false, urlCount: 2, truncated: false });
    expect(data.sitemaps).toEqual([{ url: `${origin}/sitemap.xml`, kind: 'urlset', urlCount: 2, error: null }]);
    expect(data.urls).toEqual([
      { url: `${origin}/`, lastmod: '2026-01-02' },
      { url: `${origin}/a`, lastmod: null },
    ]);
  });

  it('follows robots.txt, an index one level deep, gzip files, and reports unreadable ones', async () => {
    robots = 'User-agent: *\nDisallow: /private\nSitemap: ORIGIN/index.xml\nsitemap: /sitemap.xml\n';
    const { data } = (await get(`/api/v1/sitemap?url=${target('/')}&force=true&limit=4`)).json();
    expect(data.robotsFound).toBe(true);
    expect(data.sitemaps.map((file: { url: string; kind: string; urlCount: number; error: string | null }) => [file.url.replace(origin, ''), file.kind, file.urlCount, file.error])).toEqual([
      ['/index.xml', 'index', 0, null],
      ['/sitemap.xml', 'urlset', 2, null],
      ['/posts.xml.gz', 'urlset', 3, null],
      ['/missing.xml', 'unknown', 0, 'HTTP 404'],
      [expect.stringContaining('/s.xml'), 'unknown', 0, 'EFORBIDDENURL'],
    ]);
    expect(data.urlCount).toBe(5);
    expect(data.urls).toHaveLength(4);
    expect(data.truncated).toBe(true);
    expect(internalHits).toBe(0);
  });

  it('reads a sitemap URL directly', async () => {
    const { data } = (await get(`/api/v1/sitemap?url=${target('/posts.xml.gz')}`)).json();
    expect(data.urls.map((entry: { url: string }) => entry.url)).toEqual([`${origin}/p1`, `${origin}/p2`, `${origin}/p3`]);
  });

  it('parses robots and sitemap documents defensively', () => {
    expect(parseRobotsSitemaps('Sitemap: /a.xml\nSITEMAP:https://x.org/b.xml\nSitemap: javascript:1', 'https://e.com/robots.txt', 5)).toEqual(['https://e.com/a.xml', 'https://x.org/b.xml']);
    expect(parseSitemap('<html><body>nope</body></html>', 10).kind).toBe('unknown');
    expect(parseSitemap('<urlset><url><loc>ftp://x/</loc></url><url><loc> https://e.com/ok </loc></url></urlset>', 10)).toMatchObject({ urlCount: 2, urls: [{ url: 'https://e.com/ok', lastmod: null }] });
  });
});

describe('GET /api/v1/tech', () => {
  it('detects technologies with the evidence of each', async () => {
    const res = await get(`/api/v1/tech?url=${target('/wp')}`);
    expect(res.statusCode).toBe(200);
    const { technologies } = res.json().data;
    const byName = Object.fromEntries(technologies.map((t: { name: string; category: string; evidence: string }) => [t.name, t]));
    expect(byName['WordPress']).toEqual({ name: 'WordPress', category: 'cms', evidence: 'meta generator: WordPress 6.6' });
    expect(byName['nginx']).toMatchObject({ category: 'server', evidence: 'header server: nginx/1.25' });
    expect(byName['PHP']).toMatchObject({ category: 'language', evidence: 'header x-powered-by: PHP/8.2' });
    expect(byName['jQuery']).toMatchObject({ category: 'library' });
    expect(byName['Google Analytics']).toMatchObject({ category: 'analytics' });
    expect(Object.keys(byName)).not.toContain('Next.js');
    expect(JSON.stringify(res.json())).not.toContain('abc');
  });

  it('does not guess: an ordinary page yields nothing, errors stay errors', async () => {
    expect(detectTechnologies('<html><body><p>We love WordPress and Shopify.</p></body></html>', {})).toEqual([]);
    expect(detectTechnologies('', { 'set-cookie': 'x' }, ['laravel_session'])).toEqual([{ name: 'Laravel', category: 'framework', evidence: 'cookie: laravel_session' }]);
    expect((await get(`/api/v1/tech?url=${target('/nope')}`)).json().code).toBe('ETARGETSTATUS');
  });
});

describe('GET /api/v1/image and /api/v1/html', () => {
  it('reads real dimensions from the file header, directly or through a page', async () => {
    const direct = (await get(`/api/v1/image?url=${target('/pixel.png')}`)).json().data;
    expect(direct).toEqual({ url: `${origin}/pixel.png`, pageUrl: null, format: 'png', contentType: 'image/png', width: 1, height: 1, bytes: 70 });
    const viaPage = (await get(`/api/v1/image?url=${target('/with-image')}`)).json().data;
    expect(viaPage).toMatchObject({ url: `${origin}/pixel.png`, pageUrl: `${origin}/with-image`, width: 1, height: 1 });
    expect((await get(`/api/v1/image?url=${target('/links')}`)).json().code).toBe('EEMBEDNOTFOUND');
  });

  it('parses JPEG, GIF and WebP headers', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc2, 0x00, 0x11, 0x08]), Buffer.from([0x02, 0x76, 0x04, 0xb0]), Buffer.alloc(8)]);
    expect(readImageHeader(jpeg)).toEqual({ format: 'jpeg', width: 1200, height: 630 });
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x40, 0x01, 0xf0, 0x00])]);
    expect(readImageHeader(gif)).toEqual({ format: 'gif', width: 320, height: 240 });
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'latin1'); webp.write('WEBP', 8, 'latin1'); webp.write('VP8X', 12, 'latin1');
    webp.writeUIntLE(799, 24, 3); webp.writeUIntLE(599, 27, 3);
    expect(readImageHeader(webp)).toEqual({ format: 'webp', width: 800, height: 600 });
    expect(readImageHeader(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('returns the rendered HTML as inert plain text', async () => {
    const res = await get(`/api/v1/html?url=${target('/spa')}&waitForSelector=${enc('#done')}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-render-source']).toBe('browser');
    expect(res.headers['x-final-url']).toBe(`${origin}/spa`);
    expect(res.body).toContain('<b id="done">RENDERED</b>');
    const served = await get(`/api/v1/html?url=${target('/spa')}&render=never`);
    expect(served.body).not.toContain('<b id="done">RENDERED</b>');
    expect(served.headers['x-render-source']).toBe('http');
  });
});

describe('redirect to a forbidden plain-http target (production report)', () => {
  it('answers 403 EFORBIDDENURL on every rendering endpoint, not ETARGETSTATUS', async () => {
    const fields = enc(JSON.stringify({ t: { selector: 'body' } }));
    for (const path of [
      `/api/v1/content?url=${target('/to-internal')}&render=always`,
      `/api/v1/meta?url=${target('/to-internal')}&render=always`,
      `/api/v1/extract?url=${target('/to-internal')}&render=always&fields=${fields}`,
      `/api/v1/links?url=${target('/to-internal')}&render=always`,
      `/api/v1/screenshot?url=${target('/to-internal')}`,
    ]) {
      const res = await get(path);
      expect(res.json().code, path).toBe('EFORBIDDENURL');
      expect(res.statusCode).toBe(403);
    }
    expect(internalHits).toBe(0);
  });
});
