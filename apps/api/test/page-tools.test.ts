/**
 * `/extract?preset=`, `/tables`, `/oembed`, `/favicon`, `/qr`, plus the two
 * branches that had never been exercised: the TLS summary of `/check` and the
 * `206` / `Content-Range` answer of `/image`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createTlsServer, type Server as TlsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/create-app.js';
import { readImageHeader } from '../src/lib/image-header.js';
import { assembleApng, decodePng, encodeBilevelPng } from '../src/lib/png.js';
import { dataCodewords, encodeQr, QrCapacityError, qrToSvg } from '../src/lib/qr.js';
import { extractPreset } from '../src/services/structured-extractor.js';
import { extractTables, tableToCsv } from '../src/services/table-extractor.js';
import { corpusFile, serveCorpus, type CorpusSite } from './helpers/corpus.js';

let site: CorpusSite;
let icons: CorpusSite;
let fixture: Server;
let origin: string;
let internal: Server;
let internalPort: number;
let internalHits = 0;
let app: FastifyInstance;

const BIG_JPEG_BYTES = 734_003;

beforeAll(async () => {
  internal = createServer((_req, res) => {
    internalHits += 1;
    res.end('SECRET');
  });
  await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve));
  internalPort = (internal.address() as AddressInfo).port;
  site = await serveCorpus('content');
  icons = await serveCorpus('icons');

  fixture = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture');
    const html = (body: string) => res.writeHead(200, { 'content-type': 'text/html' }).end(body);
    if (url.pathname === '/embed-internal') html(`<html><head><link rel="alternate" type="application/json+oembed" href="http://127.0.0.1:${internalPort}/oembed"></head><body>x</body></html>`);
    else if (url.pathname === '/embed-redirect') html('<html><head><link rel="alternate" type="application/json+oembed" href="/oembed-hop"></head><body>x</body></html>');
    else if (url.pathname === '/oembed-hop') res.writeHead(302, { location: `http://127.0.0.1:${internalPort}/oembed` }).end();
    else if (url.pathname === '/embed-xml') html('<html><head><link rel="alternate" type="text/xml+oembed" href="/oembed.xml"></head><body>x</body></html>');
    else if (url.pathname === '/oembed.xml') res.writeHead(200, { 'content-type': 'text/xml' }).end('<?xml version="1.0"?><oembed><type>photo</type><title>Harbour at dawn</title><url>/photos/1.jpg</url><width>1024</width><height>683</height><provider_name>Pics</provider_name></oembed>');
    else if (url.pathname === '/embed-junk') html('<html><head><link rel="alternate" type="application/json+oembed" href="/junk"></head><body>x</body></html>');
    else if (url.pathname === '/junk') res.writeHead(200, { 'content-type': 'application/json' }).end('["not", "an", "object"]');
    else if (url.pathname === '/no-embed') html('<html><head><title>Nothing</title></head><body>x</body></html>');
    else if (url.pathname === '/icon-internal') html(`<html><head><link rel="icon" href="http://127.0.0.1:${internalPort}/i.png"><link rel="icon" href="/hop.png"></head><body>x</body></html>`);
    else if (url.pathname === '/hop.png') res.writeHead(302, { location: `http://127.0.0.1:${internalPort}/i.png` }).end();
    else if (url.pathname === '/favicon.ico') res.writeHead(200, { 'content-type': 'text/html' }).end('<html>SPA fallback</html>');
    else if (url.pathname === '/tables-spa') html('<html><body><div id="root"></div><script>document.getElementById("root").innerHTML="<table id=t><tr><th>k</th><th>v</th></tr><tr><td>a</td><td>=1+1</td></tr><tr><td>b</td><td>-12,5</td></tr><tr><td>c</td><td>-cmd</td></tr></table>";</script></body></html>');
    else if (url.pathname === '/big.jpg') {
      // A server that honours Range: 206 with the total size in Content-Range.
      const header = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14), Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x0b, 0xb8, 0x0f, 0xa0, 0x03]), Buffer.alloc(200)]);
      const range = /^bytes=0-(\d+)$/.exec(req.headers.range ?? '');
      if (range === null) return void res.writeHead(200, { 'content-type': 'image/jpeg' }).end(header);
      const last = Math.min(Number(range[1]), BIG_JPEG_BYTES - 1);
      const part = Buffer.concat([header, Buffer.alloc(last + 1 - header.length)]);
      res.writeHead(206, { 'content-type': 'image/jpeg', 'content-range': `bytes 0-${last}/${BIG_JPEG_BYTES}`, 'content-length': String(part.length), 'accept-ranges': 'bytes' }).end(part);
    } else res.writeHead(404, { 'content-type': 'text/plain' }).end('nope');
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
  await site.close();
  await icons.close();
  for (const server of [fixture, internal]) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

const enc = encodeURIComponent;
const get = (path: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url: path, headers });
const expected = () => JSON.parse(corpusFile('content/expected.json').replaceAll('{{ORIGIN}}', site.origin));

describe('GET /api/v1/extract?preset= (frozen corpus)', () => {
  it('returns the typed fields of each preset with the source of every field', async () => {
    const { presets } = expected();
    for (const [key, want] of Object.entries(presets) as Array<[string, { schemaType: string | null; fields: object; sources: object }]>) {
      const [path, query] = key.split('?');
      const res = await get(`/api/v1/extract?url=${enc(`${site.origin}/${path}`)}&${query}&render=never`);
      expect(res.statusCode, key).toBe(200);
      const { data, meta } = res.json();
      expect(meta.source).toBe('http');
      expect({ schemaType: data.schemaType, fields: data.fields, sources: data.sources }, key).toEqual(want);
      expect(data.preset).toBe(query!.split('=')[1]);
    }
  });

  it('types values, names sources and falls back in order', async () => {
    const product = (await get(`/api/v1/extract?url=${enc(`${site.origin}/product`)}&preset=product`)).json().data;
    expect(product.fields).toMatchObject({ price: 64, currency: 'EUR', availability: 'InStock', ratingValue: 4.7, reviewCount: 212 });
    expect(product.sources.price).toBe('json-ld');
    const micro = (await get(`/api/v1/extract?url=${enc(`${site.origin}/product-microdata`)}&preset=product`)).json().data;
    expect(micro.fields).toMatchObject({ name: 'Lampe Halo', price: 129.9, availability: 'OutOfStock', brand: 'Maison Verre' });
    expect(micro.sources).toMatchObject({ name: 'microdata', price: 'microdata', sku: null });
    const plain = (await get(`/api/v1/extract?url=${enc(`${site.origin}/plain`)}&preset=article`)).json().data;
    expect(plain.schemaType).toBeNull();
    expect(plain.sources).toMatchObject({ headline: 'css', description: 'meta', author: 'meta', datePublished: null });
    // Open Graph beats CSS when there is no schema.org node.
    const og = extractPreset('<meta property="og:title" content="OG"><meta property="product:price:amount" content="1 299,50"><h1>H1</h1><p class="price">9</p>', 'https://x.test/', 'product');
    expect(og.fields).toMatchObject({ name: 'OG', price: 1299.5 });
    expect(og.sources).toMatchObject({ name: 'opengraph', price: 'opengraph' });
    // Hostile shapes do not throw and do not leak non-http URLs.
    const odd = extractPreset('<script type="application/ld+json">{"@type":"Product","name":{"x":1},"image":"javascript:alert(1)","offers":[{"price":{"deep":{}}}],"brand":[[["x"]]]}</script>', 'https://x.test/', 'product');
    expect(odd.fields).toMatchObject({ name: null, image: null, price: null });
  });

  it('requires exactly one of fields and preset, and keeps the usual failures', async () => {
    const url = enc(`${site.origin}/product`);
    expect((await get(`/api/v1/extract?url=${url}`)).json().code).toBe('EINVALIDPARAMS');
    expect((await get(`/api/v1/extract?url=${url}&preset=product&fields=${enc('{"a":{"selector":"h1"}}')}`)).json().code).toBe('EINVALIDPARAMS');
    expect((await get(`/api/v1/extract?url=${url}&preset=invoice`)).statusCode).toBe(400);
    expect((await get(`/api/v1/extract?url=${enc(`${site.origin}/sitemap.xml`)}&preset=article`)).json().code).toBe('ENOTHTML');
    expect((await get(`/api/v1/extract?url=${enc(`http://127.0.0.1:${internalPort}/`)}&preset=article`)).json().code).toBe('EFORBIDDENURL');
    // The classic `fields` mode is untouched.
    const classic = (await get(`/api/v1/extract?url=${url}&fields=${enc('{"t":{"selector":"h1"}}')}`)).json().data;
    expect(classic).toEqual({ url: `${site.origin}/product`, fields: { t: 'Kettlewell Pour-Over Kettle 0.9 L' } });
  });
});

describe('GET /api/v1/tables', () => {
  it('returns data tables with headers, spans expanded and layout tables skipped', async () => {
    const res = await get(`/api/v1/tables?url=${enc(`${site.origin}/product`)}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    const { url, ...tables } = res.json().data;
    expect(url).toBe(`${site.origin}/product`);
    expect(tables).toEqual(expected().tables.product);
    expect(tables.tables[1]).toMatchObject({ headers: ['Size', 'Price EU', 'Price UK'], rows: [['0.6 L', '€54.00', '£46.00'], ['0.9 L', '€64.00', '£55.00']] });
    const only = (await get(`/api/v1/tables?url=${enc(`${site.origin}/product`)}&selector=${enc('#prices')}`)).json().data;
    expect(only.tables).toHaveLength(1);
    expect(only.tables[0].headers).toEqual(['Size', 'Price EU', 'Price UK']);
  });

  it('exports one table as CSV and neutralises spreadsheet formulas', async () => {
    const res = await get(`/api/v1/tables?url=${enc(`${site.origin}/product`)}&format=csv`);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="table-0.csv"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toBe('Property,Value\r\nCapacity,0.9 L\r\nMaterial,"Brushed steel, 18/8"\r\nWeight,540 g\r\nHob,"Gas, electric, ""induction"""\r\n');
    const spa = await get(`/api/v1/tables?url=${enc(`${origin}/tables-spa`)}&format=csv`);
    expect(spa.headers['x-render-source']).toBe('browser');
    expect(spa.body).toBe("k,v\r\na,'=1+1\r\nb,\"-12,5\"\r\nc,'-cmd\r\n");
    expect((await get(`/api/v1/tables?url=${enc(`${site.origin}/product`)}&format=csv&table=7`)).json().code).toBe('EEMBEDNOTFOUND');
  });

  it('bounds rows, columns and tables, and validates input', async () => {
    const wide = `<table>${'<tr>' + '<td>x</td>'.repeat(80) + '</tr>'}${'<tr><td>y</td></tr>'.repeat(1500)}</table>`;
    const bounded = extractTables(wide);
    expect(bounded.tables[0]).toMatchObject({ columnCount: 50, rowCount: 1000, truncated: true });
    expect(bounded.truncated).toBe(true);
    expect(extractTables('<table><tr><td rowspan="999999" colspan="999999">x</td><td>y</td></tr></table>').tables[0]!.columnCount).toBe(50);
    expect(extractTables('<table>'.repeat(40) + '<tr><td>a</td><td>b</td></tr>' + '</table>'.repeat(40)).total).toBe(1);
    expect(extractTables('<table><tr><td>a</td><td>b</td></tr></table>'.repeat(30))).toMatchObject({ total: 30, truncated: true });
    expect(tableToCsv({ headers: [], rows: [['@SUM(A1)', '+1', '-3.5%', 'a\nb']] })).toBe("'@SUM(A1),'+1,-3.5%,\"a\nb\"\r\n");
    expect((await get(`/api/v1/tables?url=${enc(`${site.origin}/product`)}&selector=${enc('xpath=//table')}`)).json().code).toBe('EINVALIDPARAMS');
    expect((await get(`/api/v1/tables?url=${enc(`${site.origin}/product`)}&format=xlsx`)).statusCode).toBe(400);
    expect((await get(`/api/v1/tables?url=${enc(`http://127.0.0.1:${internalPort}/`)}`)).json().code).toBe('EFORBIDDENURL');
    expect((await get(`/api/v1/tables?url=${enc(`${site.origin}/img/gauge.png`)}`)).json().code).toBe('ENOTHTML');
  });
});

describe('GET /api/v1/oembed', () => {
  it('follows the discovery link and normalises the document; html stays an inert string', async () => {
    const res = await get(`/api/v1/oembed?url=${enc(`${site.origin}/article`)}&maxWidth=480`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.json().data).toEqual({
      url: `${site.origin}/article`,
      endpoint: `${site.origin}/oembed.json?url=article&maxwidth=480`,
      type: 'video',
      version: '1.0',
      title: 'Tide tables <b>explained</b>',
      authorName: 'Estuary Gazette',
      authorUrl: 'https://gazette.example/authors',
      providerName: 'Estuary TV',
      providerUrl: 'https://tv.example/',
      thumbnailUrl: 'https://tv.example/thumb.jpg',
      thumbnailWidth: 480,
      thumbnailHeight: 270,
      width: 640,
      height: 360,
      photoUrl: null,
      html: '<iframe src="https://tv.example/embed/42" width="640" height="360"></iframe><script>alert(1)</script>',
      cacheAge: 3600,
    });
  });

  it('reads XML documents and resolves relative URLs against the endpoint', async () => {
    const { data } = (await get(`/api/v1/oembed?url=${enc(`${origin}/embed-xml`)}`)).json();
    expect(data).toMatchObject({ type: 'photo', title: 'Harbour at dawn', photoUrl: `${origin}/photos/1.jpg`, width: 1024, height: 683, providerName: 'Pics', html: null });
  });

  it('fails cleanly and never lets the page choose an internal endpoint', async () => {
    expect((await get(`/api/v1/oembed?url=${enc(`${origin}/no-embed`)}`)).json()).toMatchObject({ status: 'fail', code: 'EEMBEDNOTFOUND' });
    expect((await get(`/api/v1/oembed?url=${enc(`${origin}/embed-junk`)}`)).json().code).toBe('EEMBEDNOTFOUND');
    expect((await get(`/api/v1/oembed?url=${enc(`${origin}/missing`)}`)).json().code).toBe('ETARGETSTATUS');
    expect((await get(`/api/v1/oembed?url=${enc(`${site.origin}/img/gauge.png`)}`)).json().code).toBe('ENOTHTML');
    expect((await get(`/api/v1/oembed?url=${enc(`${origin}/no-embed`)}&maxWidth=0`)).statusCode).toBe(400);
    expect((await get(`/api/v1/oembed?url=${enc(`${origin}/embed-internal`)}`)).json().code).toBe('EFORBIDDENURL');
    expect((await get(`/api/v1/oembed?url=${enc(`${origin}/embed-redirect`)}`)).json().code).toBe('EFORBIDDENURL');
    expect((await get(`/api/v1/oembed?url=${enc(`http://127.0.0.1:${internalPort}/`)}`)).json().code).toBe('EFORBIDDENURL');
    expect(internalHits).toBe(0);
  });
});

describe('GET /api/v1/favicon', () => {
  it('measures declared, manifest and default icons and picks the largest real one', async () => {
    const res = await get(`/api/v1/favicon?url=${enc(`${site.origin}/article`)}`);
    expect(res.statusCode, res.body).toBe(200);
    const { data } = res.json();
    expect(data.pageUrl).toBe(`${site.origin}/article`);
    expect(data.icon).toEqual({ url: `${site.origin}/icon-512.png`, rel: 'manifest', declaredSizes: '512x512', format: 'png', contentType: 'image/png', width: 512, height: 512, bytes: expect.any(Number) });
    expect(data.icons.map((i: { rel: string; format: string; width: number | null }) => [i.rel, i.format, i.width])).toEqual([
      ['manifest', 'png', 512], ['apple-touch-icon', 'png', 180], ['default', 'ico', 48], ['icon', 'png', 32], ['icon', 'svg', null],
    ]);
  });

  it('trusts the file, not the declared size; redirects on demand', async () => {
    const { data } = (await get(`/api/v1/favicon?url=${enc(`${icons.origin}/`)}`)).json();
    expect(data.icons.find((i: { url: string }) => i.url.endsWith('/small.png'))).toMatchObject({ declaredSizes: '512x512', width: 32, height: 32 });
    expect(data.icon.url).toBe(`${icons.origin}/icon-512.png`);
    const redirect = await get(`/api/v1/favicon?url=${enc(`${icons.origin}/`)}&redirect=true`);
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers['location']).toBe(`${icons.origin}/icon-512.png`);
  });

  it('answers 404 when nothing is an image, and never fetches an internal icon', async () => {
    // Declared icons are internal (directly and through a redirect); /favicon.ico is an HTML fallback.
    expect((await get(`/api/v1/favicon?url=${enc(`${origin}/icon-internal`)}`)).json()).toMatchObject({ status: 'fail', code: 'EEMBEDNOTFOUND' });
    expect((await get(`/api/v1/favicon?url=${enc(`${origin}/missing`)}`)).json().code).toBe('ETARGETSTATUS');
    expect((await get(`/api/v1/favicon?url=${enc(`http://127.0.0.1:${internalPort}/`)}`)).json().code).toBe('EFORBIDDENURL');
    expect((await get('/api/v1/favicon?url=notaurl')).json().code).toBe('EINVALIDURL');
    expect(internalHits).toBe(0);
    expect(readImageHeader(Buffer.from([0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 22, 0, 0, 0]))).toEqual({ format: 'ico', width: 256, height: 256 });
  });
});

describe('GET /api/v1/qr', () => {
  const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

  it('encodes symbols that an independent decoder reads (frozen matrices)', () => {
    // Matrices checked once against the jsQR decoder for every version and level; frozen here.
    const hello = encodeQr('HELLO WORLD', 'Q');
    expect([hello.version, hello.size, sha(hello.modules)]).toEqual([1, 21, '3750cdb2a3cd6d3a67cd3f667a77a43893177f36531b3c491280a08bc8dafb96']);
    const utf8 = encodeQr('https://omnillink.example/é?x=1', 'M');
    expect([utf8.version, sha(utf8.modules)]).toEqual([3, 'cea0e7a50b85c55af4e0a9e7e1912d2f0a92bb855d514dad180f414a56567f6c']);
    // Capacities of the standard, and structure every symbol must have.
    expect([dataCodewords(1, 'L'), dataCodewords(10, 'M'), dataCodewords(27, 'Q'), dataCodewords(40, 'L'), dataCodewords(40, 'H')]).toEqual([19, 216, 808, 2956, 1276]);
    for (const [text, ecc] of [['a', 'L'], ['x'.repeat(300), 'H'], ['y'.repeat(2900), 'L']] as const) {
      const qr = encodeQr(text, ecc);
      const at = (x: number, y: number) => qr.modules[y * qr.size + x];
      expect(qr.size).toBe(qr.version * 4 + 17);
      // Finder pattern corners, timing pattern, the always-dark module.
      expect([at(0, 0), at(6, 0), at(3, 3), at(1, 1), at(7, 7)]).toEqual([1, 1, 1, 0, 0]);
      expect([at(8, 6), at(9, 6), at(10, 6)]).toEqual([1, 0, 1]);
      expect(at(8, qr.size - 8)).toBe(1);
    }
    expect(encodeQr('y'.repeat(2900), 'L').version).toBe(40);
    expect(() => encodeQr('z'.repeat(3000), 'L')).toThrow(QrCapacityError);
    expect(qrToSvg(hello, { size: 100, margin: 0, color: '#000000', background: null })).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100" height="100" viewBox="0 0 21 21"[^>]*><path fill="#000000" d="M0 0h7v1h-7z/);
  });

  it('serves SVG by default and PNG on demand, cacheable and inert', async () => {
    const svg = await get(`/api/v1/qr?url=${enc('https://example.com/a?b=1')}`);
    expect(svg.statusCode).toBe(200);
    expect(svg.headers['content-type']).toBe('image/svg+xml; charset=utf-8');
    expect(svg.headers['cache-control']).toBe('public, max-age=86400, immutable');
    expect(svg.headers['content-security-policy']).toContain('sandbox');
    expect(svg.headers['x-qr-version']).toBe('2');
    expect(svg.body).toContain('viewBox="0 0 33 33"');
    expect(svg.body).toContain('<rect width="33" height="33" fill="#ffffff"/>');
    expect((await get(`/api/v1/qr?url=${enc('https://example.com/a?b=1')}`, { 'if-none-match': String(svg.headers['etag']) })).statusCode).toBe(304);

    const png = await get(`/api/v1/qr?url=${enc('https://example.com/a?b=1')}&format=png&size=330&margin=4&color=${enc('#0a3d62')}&background=00000000`);
    expect(png.headers['content-type']).toBe('image/png');
    expect(readImageHeader(png.rawPayload)).toEqual({ format: 'png', width: 330, height: 330 });
    expect(png.rawPayload.includes(Buffer.from([0x0a, 0x3d, 0x62]))).toBe(true);
    expect(png.rawPayload.byteLength).toBeLessThan(2000);
    const coloured = await get(`/api/v1/qr?url=${enc('https://example.com/')}&color=f00&background=${enc('#00000000')}&margin=0&ecc=H`);
    expect(coloured.body).toContain('fill="#ff0000"');
    expect(coloured.body).not.toContain('<rect');
  });

  it('validates every parameter strictly and never fetches the URL', async () => {
    const ok = enc('https://example.com/');
    const bad = [
      `url=${ok}&size=63`, `url=${ok}&size=4096`, `url=${ok}&margin=17`, `url=${ok}&ecc=X`, `url=${ok}&format=gif`,
      `url=${ok}&color=red`, `url=${ok}&color=${enc('#12')}`, `url=${ok}&color=${enc('"/><script>alert(1)</script>')}`,
      `url=${ok}&background=${enc('url(http://x)')}`, `url=${enc('https://example.com/' + 'a'.repeat(1300))}&ecc=H`, '',
    ];
    for (const query of bad) expect((await get(`/api/v1/qr?${query}`)).statusCode, query).toBe(400);
    expect((await get(`/api/v1/qr?url=${enc('javascript:alert(1)')}`)).json().code).toBe('EINVALIDURL');
    expect((await get('/api/v1/qr?url=nope')).json().code).toBe('EINVALIDURL');
    expect((await get(`/api/v1/qr?url=${enc('https://example.com/' + 'a'.repeat(900))}&format=png&size=64`)).json().code).toBe('EINVALIDPARAMS');
    // An internal URL is only *encoded*: nothing is requested.
    expect((await get(`/api/v1/qr?url=${enc(`http://127.0.0.1:${internalPort}/`)}`)).statusCode).toBe(200);
    expect(internalHits).toBe(0);
  });
});

describe('PNG helpers', () => {
  it('round-trips pixels and assembles frames into an animated PNG', () => {
    const png = encodeBilevelPng(9, 3, (x, y) => (x + y) % 2 === 0, { r: 1, g: 2, b: 3, a: 255 }, { r: 250, g: 251, b: 252, a: 255 });
    expect(readImageHeader(png)).toEqual({ format: 'png', width: 9, height: 3 });
    expect(() => decodePng(png, 1000)).toThrow('unsupported PNG variant');
    expect(() => decodePng(Buffer.from('nope'), 1000)).toThrow('not a PNG');
    expect(() => assembleApng([png, encodeBilevelPng(8, 3, () => true, { r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 })], 100)).toThrow('frames differ');
    const apng = assembleApng([png, png, png], 120);
    expect(apng.includes(Buffer.from('acTL'))).toBe(true);
    expect(apng.toString('latin1').split('fcTL').length - 1).toBe(3);
    expect(apng.toString('latin1').split('fdAT').length - 1).toBe(2);
    expect(readImageHeader(apng)).toEqual({ format: 'png', width: 9, height: 3 });
  });
});

describe('GET /api/v1/image — partial content', () => {
  it('reads the total size from Content-Range when the server answers 206', async () => {
    const res = await get(`/api/v1/image?url=${enc(`${origin}/big.jpg`)}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toEqual({ url: `${origin}/big.jpg`, pageUrl: null, format: 'jpeg', contentType: 'image/jpeg', width: 4000, height: 3000, bytes: BIG_JPEG_BYTES });
  });
});

const hasOpenssl = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasOpenssl)('GET /api/v1/check — TLS certificate summary', () => {
  let dir: string;
  let tls: TlsServer;
  let tlsOrigin: string;
  let ca: string;

  beforeAll(async () => {
    // A throw-away CA, trusted by one app instance through the test-only seam. Verification stays on.
    dir = mkdtempSync(join(tmpdir(), 'omnillink-tls-'));
    const ssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' });
    ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '2', '-subj', '/O=Omnillink Test CA/CN=Omnillink Test Root');
    ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'leaf.key', '-out', 'leaf.csr', '-subj', '/CN=omnillink.test');
    writeFileSync(join(dir, 'ext.cnf'), 'subjectAltName=IP:127.0.0.1,DNS:omnillink.test\nbasicConstraints=CA:FALSE\n');
    ssl('x509', '-req', '-in', 'leaf.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'leaf.pem', '-days', '30', '-extfile', 'ext.cnf');
    ca = readFileSync(join(dir, 'ca.pem'), 'utf8');
    tls = createTlsServer({ key: readFileSync(join(dir, 'leaf.key')), cert: readFileSync(join(dir, 'leaf.pem')) }, (req, res) => {
      if (req.url === '/moved') res.writeHead(301, { location: '/' }).end();
      else res.writeHead(200, { 'content-type': 'text/html', 'content-length': '2' }).end('ok');
    });
    await new Promise<void>((resolve) => tls.listen(0, '127.0.0.1', resolve));
    tlsOrigin = `https://127.0.0.1:${(tls.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    tls.closeAllConnections();
    await new Promise((resolve) => tls.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  const config = () => loadConfig({ NODE_ENV: 'test', SSRF_ALLOW_PRIVATE_NETWORKS: 'true', SSRF_ALLOWED_PORTS: '*' });

  it('reports subject, issuer, validity and days left of the certificate of the last hop', async () => {
    const trusting = await buildApp(config(), { tlsCa: ca });
    try {
      const res = await trusting.inject(`/api/v1/check?url=${enc(`${tlsOrigin}/moved`)}`);
      expect(res.statusCode, res.body).toBe(200);
      const { data } = res.json();
      expect(data).toMatchObject({ ok: true, status: 200, finalUrl: `${tlsOrigin}/`, contentType: 'text/html', contentLength: 2 });
      expect(data.redirects.map((hop: { status: number }) => hop.status)).toEqual([301, 200]);
      expect(data.tls).toMatchObject({ subject: 'omnillink.test', issuer: 'Omnillink Test CA' });
      expect([29, 30]).toContain(data.tls.daysLeft);
      expect(Date.parse(data.tls.validTo) - Date.parse(data.tls.validFrom)).toBe(30 * 86_400_000);
      // The same seam serves the fetch path: an https page is readable too.
      expect((await trusting.inject(`/api/v1/meta?url=${enc(`${tlsOrigin}/`)}&render=never`)).statusCode).toBe(200);
    } finally {
      await trusting.close();
    }
  });

  it('still refuses a certificate it has no reason to trust', async () => {
    const strict = await buildApp(config());
    try {
      const res = await strict.inject(`/api/v1/check?url=${enc(`${tlsOrigin}/`)}`);
      expect(res.statusCode).toBe(502);
      expect(res.json().code).toBe('EUNREACHABLE');
      expect((await strict.inject(`/api/v1/meta?url=${enc(`${tlsOrigin}/`)}&render=never`)).json().code).toBe('EUNREACHABLE');
    } finally {
      await strict.close();
    }
  });
});
