/**
 * `/og`, `/palette`, `/animation`, and the capture / PDF options added to
 * `/screenshot` and `/pdf`. Real Chromium, local fixtures only.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/create-app.js';
import { parseHexColor } from '../src/lib/colors.js';
import { escapeHtml } from '../src/lib/html-escape.js';
import { readImageHeader } from '../src/lib/image-header.js';
import { extractPalette } from '../src/lib/palette.js';
import { decodePng } from '../src/lib/png.js';
import { buildOgHtml } from '../src/services/og-service.js';
import { headerFooterTemplate, parsePageRanges } from '../src/services/pdf-service.js';
import { serveCorpus, type CorpusSite } from './helpers/corpus.js';

let site: CorpusSite;
let fixture: Server;
let origin: string;
let internal: Server;
let internalPort: number;
let internalHits = 0;
let app: FastifyInstance;

const ACTIONS_PAGE = `<!doctype html><html><head><title>Actions</title><style>body{margin:0;background:#fff;font:16px sans-serif}
#panel{display:none;position:fixed;inset:0;background:#00aa00}#panel.open{display:block}#far{margin-top:3000px;height:800px;background:#0000cc}
#cover{position:fixed;inset:0;display:none}</style></head><body>
<button id="open" onclick="document.getElementById('panel').className='open'">Open</button>
<button id="hidden" style="display:none">Hidden</button>
<div id="panel"></div><div id="far"></div></body></html>`;

beforeAll(async () => {
  internal = createServer((_req, res) => {
    internalHits += 1;
    res.end('SECRET');
  });
  await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve));
  internalPort = (internal.address() as AddressInfo).port;
  site = await serveCorpus('content');
  fixture = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture').pathname;
    if (path === '/actions') res.writeHead(200, { 'content-type': 'text/html' }).end(ACTIONS_PAGE);
    else if (path === '/red') res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body style="margin:0;background:#ff0000"></body></html>');
    else if (path === '/img-internal') res.writeHead(200, { 'content-type': 'text/html' }).end(`<html><head><meta property="og:image" content="http://127.0.0.1:${internalPort}/x.jpg"></head><body>x</body></html>`);
    else if (path === '/hop.jpg') res.writeHead(302, { location: `http://127.0.0.1:${internalPort}/x.jpg` }).end();
    else res.writeHead(404, { 'content-type': 'text/plain' }).end('nope');
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
  for (const server of [fixture, internal]) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

const enc = encodeURIComponent;
const get = (path: string) => app.inject({ method: 'GET', url: path });
/** Colour of one pixel of a PNG answer, as `r,g,b`. */
const pixel = (png: Buffer, x: number, y: number): string => {
  const image = decodePng(png, 20_000_000);
  const offset = (y * image.width + x) * image.channels;
  return [...image.pixels.subarray(offset, offset + 3)].join(',');
};

describe('GET /api/v1/og', () => {
  it('renders a 1200×630 card from text, with the accent colour of the template', async () => {
    const res = await get(`/api/v1/og?title=${enc('Des sites qui chargent vite')}&description=${enc('Conception, développement et suivi.')}&site=${enc('Atelier Lumen')}&label=Guide&template=split&accent=${enc('#e11d48')}`);
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-cache']).toBe('MISS');
    expect(readImageHeader(res.rawPayload)).toEqual({ format: 'png', width: 1200, height: 630 });
    // The split template paints a 28 px accent band on the left, paper elsewhere.
    expect(pixel(res.rawPayload, 10, 300)).toBe('225,29,72');
    expect(pixel(res.rawPayload, 1190, 10)).toBe('255,255,255');
    const again = await get(`/api/v1/og?title=${enc('Des sites qui chargent vite')}&description=${enc('Conception, développement et suivi.')}&site=${enc('Atelier Lumen')}&label=Guide&template=split&accent=${enc('#e11d48')}`);
    expect(again.headers['x-cache']).toBe('HIT');
    const dark = await get(`/api/v1/og?title=Hello&theme=dark&format=jpeg`);
    expect(readImageHeader(dark.rawPayload)).toEqual({ format: 'jpeg', width: 1200, height: 630 });
  });

  it('escapes every text and loads nothing: markup in a parameter is shown, not run', async () => {
    const hostile = `</h1><script>document.body.style.background='#00ff00'</script><img src="http://127.0.0.1:${internalPort}/beacon"><style>body{background:#00ff00!important}</style>`;
    const html = buildOgHtml({ title: hostile, description: hostile, site: hostile, author: hostile, label: '<b>x</b>', template: 'classic', theme: 'light', accent: '#2563eb', format: 'png', force: false, ttlSeconds: null });
    expect(html).not.toMatch(/<script|<img|<b>/);
    expect(html.match(/<style/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('&lt;/h1&gt;&lt;script&gt;');
    expect(html).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/);
    const res = await get(`/api/v1/og?title=${enc(hostile.slice(0, 160))}&description=${enc(hostile)}`);
    expect(res.statusCode).toBe(200);
    expect(pixel(res.rawPayload, 1190, 300)).toBe('255,255,255');
    expect(internalHits).toBe(0);
    expect(escapeHtml(`a<b>&"'\`\u0000\u0007c`)).toBe('a&lt;b&gt;&amp;&quot;&#39;&#96;c');
  });

  it('validates lengths, enumerations and colours', async () => {
    for (const query of ['', 'title=', `title=${'x'.repeat(161)}`, `title=ok&description=${'x'.repeat(301)}`, 'title=ok&template=fancy', 'title=ok&theme=sepia', 'title=ok&accent=blue', `title=ok&accent=${enc('red;background:url(http://x)')}`, 'title=ok&format=gif', `title=${enc('   ')}`]) {
      expect((await get(`/api/v1/og?${query}`)).statusCode, query).toBe(400);
    }
    expect(() => parseHexColor('#12345', 'c')).toThrow();
    expect(parseHexColor('abc', 'c')).toMatchObject({ css: '#aabbcc', a: 255 });
    expect(parseHexColor('#11223380', 'c')).toMatchObject({ css: '#11223380', a: 128 });
  });
});

describe('GET /api/v1/palette', () => {
  const near = (hex: string, [r, g, b]: [number, number, number], tolerance = 12) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return Math.abs((value >> 16) - r) <= tolerance && Math.abs(((value >> 8) & 255) - g) <= tolerance && Math.abs((value & 255) - b) <= tolerance;
  };

  it('decodes a PNG in process', async () => {
    const res = await get(`/api/v1/palette?url=${enc(`${site.origin}/img/gauge.png`)}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().meta.source).toBe('http');
    expect(res.json().data).toEqual({ url: `${site.origin}/img/gauge.png`, pageUrl: null, format: 'png', dominant: '#145aa0', colors: [{ hex: '#145aa0', rgb: [20, 90, 160], population: 1 }] });
    // A page: the palette of its preview image.
    const page = (await get(`/api/v1/palette?url=${enc(`${site.origin}/article`)}`)).json().data;
    expect(page).toMatchObject({ pageUrl: `${site.origin}/article`, dominant: '#145aa0' });
  });

  it('lets Chromium decode JPEG, WebP and palette PNG, through the guarded path', async () => {
    for (const file of ['photo.jpg', 'photo.webp', 'indexed.png']) {
      const res = await get(`/api/v1/palette?url=${enc(`${site.origin}/img/${file}`)}&count=3`);
      expect(res.statusCode, `${file} ${res.body}`).toBe(200);
      const { data, meta } = res.json();
      expect(meta.source, file).toBe('browser');
      expect(data.colors, file).toHaveLength(3);
      expect(near(data.dominant, [20, 88, 159]), `${file} ${data.dominant}`).toBe(true);
      expect(data.colors.some((c: { hex: string }) => near(c.hex, [242, 233, 220])), file).toBe(true);
      expect(data.colors.some((c: { hex: string }) => near(c.hex, [192, 57, 43])), file).toBe(true);
      const total = data.colors.reduce((sum: number, c: { population: number }) => sum + c.population, 0);
      expect(total).toBeGreaterThan(0.98);
      expect(total).toBeLessThan(1.02);
    }
  });

  it('fails cleanly and never loads an internal image', async () => {
    expect((await get(`/api/v1/palette?url=${enc(`${site.origin}/plain`)}`)).json().code).toBe('EEMBEDNOTFOUND');
    expect((await get(`/api/v1/palette?url=${enc(`${site.origin}/sitemap.xml`)}`)).json().code).toBe('EEMBEDNOTFOUND');
    expect((await get(`/api/v1/palette?url=${enc(`${site.origin}/img/none.png`)}`)).json().code).toBe('ETARGETSTATUS');
    expect((await get(`/api/v1/palette?url=${enc(`${site.origin}/img/gauge.png`)}&count=9`)).statusCode).toBe(400);
    expect((await get(`/api/v1/palette?url=${enc(`${origin}/img-internal`)}`)).json().code).toBe('EFORBIDDENURL');
    expect((await get(`/api/v1/palette?url=${enc(`${origin}/hop.jpg`)}`)).json().code).toBe('EFORBIDDENURL');
    expect((await get(`/api/v1/palette?url=${enc(`http://127.0.0.1:${internalPort}/x.jpg`)}`)).json().code).toBe('EFORBIDDENURL');
    expect(internalHits).toBe(0);
    expect(extractPalette(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0]), 4, 4)).toEqual([]);
    expect(extractPalette(Buffer.from([10, 20, 30, 10, 20, 30]), 3, 5)).toEqual([{ hex: '#0a141e', rgb: [10, 20, 30], population: 1 }]);
  });
});

describe('GET /api/v1/animation', () => {
  it('returns an animated PNG of a scroll-through, within its caps', async () => {
    const res = await get(`/api/v1/animation?url=${enc(`${site.origin}/article`)}&frames=4&width=640&height=400&delay=500`);
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    expect(res.headers['content-type']).toBe('image/apng');
    expect(res.headers['x-animation-frames']).toBe('4');
    expect(readImageHeader(res.rawPayload)).toEqual({ format: 'png', width: 640, height: 400 });
    const text = res.rawPayload.toString('latin1');
    expect(text.split('fcTL').length - 1).toBe(4);
    expect(text.indexOf('acTL')).toBeLessThan(text.indexOf('IDAT'));
    expect(res.rawPayload.readUInt32BE(41)).toBe(4);
    expect((await get(`/api/v1/animation?url=${enc(`${site.origin}/article`)}&frames=4&width=640&height=400&delay=500`)).headers['x-cache']).toBe('HIT');
    // A page that does not scroll is a single frame, not an error.
    const still = await get(`/api/v1/animation?url=${enc(`${site.origin}/plain`)}`);
    expect(still.headers['x-animation-frames']).toBe('1');
  });

  it('stops at the byte budget, validates input and keeps the SSRF guarantees', async () => {
    const tight = await buildApp(loadConfig({ NODE_ENV: 'test', SSRF_ALLOW_PRIVATE_NETWORKS: 'true', SSRF_ALLOWED_PORTS: '*', ANIMATION_MAX_BYTES: '65536' }));
    try {
      const res = await tight.inject(`/api/v1/animation?url=${enc(`${site.origin}/article`)}&frames=10&width=1280&height=800`);
      if (res.statusCode === 200) {
        expect(Number(res.headers['x-animation-frames'])).toBeLessThan(10);
        expect(res.rawPayload.byteLength).toBeLessThan(65_536 + 4096);
      } else {
        expect(res.json().code).toBe('ETOOLARGE');
      }
    } finally {
      await tight.close();
    }
    for (const query of ['frames=1', 'frames=11', 'width=5000', 'height=100', 'delay=10']) {
      expect((await get(`/api/v1/animation?url=${enc(`${site.origin}/plain`)}&${query}`)).statusCode, query).toBe(400);
    }
    expect((await get(`/api/v1/animation?url=${enc(`http://127.0.0.1:${internalPort}/`)}`)).json().code).toBe('EFORBIDDENURL');
    expect((await get(`/api/v1/animation?url=${enc(`${site.origin}/nope`)}`)).json().code).toBe('ETARGETSTATUS');
    expect(internalHits).toBe(0);
  });
});

describe('GET /api/v1/screenshot — actions and decoration', () => {
  const shot = (query: string) => get(`/api/v1/screenshot?url=${enc(`${origin}/actions`)}&width=400&height=300${query}`);

  it('clicks one element before the capture', async () => {
    expect(pixel((await shot('')).rawPayload, 200, 200)).toBe('255,255,255');
    const clicked = await shot(`&click=${enc('#open')}`);
    expect(clicked.statusCode, clicked.body.slice(0, 200)).toBe(200);
    expect(pixel(clicked.rawPayload, 200, 200)).toBe('0,170,0');
  });

  it('scrolls an element into view before the capture', async () => {
    const scrolled = await shot(`&scrollTo=${enc('#far')}`);
    expect(scrolled.statusCode).toBe(200);
    expect(pixel(scrolled.rawPayload, 200, 250)).toBe('0,0,204');
  });

  it('hardens click and scrollTo like selector', async () => {
    expect((await shot(`&click=${enc('#absent')}`)).json().code).toBe('ESELECTORNOTFOUND');
    expect((await shot(`&click=${enc('#hidden')}`)).json().code).toBe('ESELECTORNOTFOUND');
    expect((await shot(`&scrollTo=${enc('#absent')}`)).json().code).toBe('ESELECTORNOTFOUND');
    for (const selector of ['xpath=//button', 'text=Open', '//button', 'button >> nth=0', 'a{}', 'javascript:alert(1);']) {
      expect((await shot(`&click=${enc(selector)}`)).json().code, selector).toBe('EINVALIDPARAMS');
      expect((await shot(`&scrollTo=${enc(selector)}`)).json().code, selector).toBe('EINVALIDPARAMS');
    }
    expect((await shot(`&click=${enc('x'.repeat(301))}`)).statusCode).toBe(400);
  });

  it('composes padding, rounded corners and a device frame around the capture', async () => {
    const red = (query: string) => get(`/api/v1/screenshot?url=${enc(`${origin}/red`)}&width=400&height=300${query}`);
    const padded = await red(`&padding=40&radius=24&background=${enc('#0000ff')}`);
    expect(padded.statusCode, padded.body.slice(0, 200)).toBe(200);
    expect(readImageHeader(padded.rawPayload)).toEqual({ format: 'png', width: 480, height: 380 });
    expect(pixel(padded.rawPayload, 5, 5)).toBe('0,0,255');
    expect(pixel(padded.rawPayload, 240, 190)).toBe('255,0,0');
    // The corner of the capture is rounded away: background shows through.
    expect(pixel(padded.rawPayload, 42, 42)).toBe('0,0,255');

    const browser = await red('&frame=browser');
    expect(readImageHeader(browser.rawPayload)).toEqual({ format: 'png', width: 448, height: 388 });
    expect(pixel(browser.rawPayload, 224, 27)).toBe('233,235,238');
    expect(pixel(browser.rawPayload, 224, 200)).toBe('255,0,0');
    const phone = await red('&frame=phone&format=jpeg');
    expect(readImageHeader(phone.rawPayload)).toEqual({ format: 'jpeg', width: 476, height: 376 });

    expect((await red('&frame=tv')).statusCode).toBe(400);
    expect((await red('&radius=65')).statusCode).toBe(400);
    expect((await red('&padding=201')).statusCode).toBe(400);
    expect((await red(`&padding=10&background=${enc('url(x)')}`)).statusCode).toBe(400);
    expect((await red('&frame=browser&fullPage=true')).json().code).toBe('EINVALIDPARAMS');
  });
});

describe('GET /api/v1/pdf — layout options', () => {
  const pdf = (query: string) => get(`/api/v1/pdf?url=${enc(`${site.origin}/article`)}${query}`);
  const pages = (body: Buffer) => body.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;

  it('applies page ranges, margins, scale and an escaped header and footer', async () => {
    const whole = await pdf('');
    expect(whole.statusCode).toBe(200);
    const total = pages(whole.rawPayload);
    expect(total).toBeGreaterThan(3);
    const ranged = await pdf('&pageRanges=1-2');
    expect(ranged.headers['content-type']).toBe('application/pdf');
    expect(pages(ranged.rawPayload)).toBe(2);
    expect(pages((await pdf('&scale=0.5&margin=5')).rawPayload)).toBeLessThan(total);
    expect(pages((await pdf('&margin=50')).rawPayload)).toBeGreaterThan(total);
    const decorated = await pdf(`&pageRanges=1&headerText=${enc('<b>Estuary</b> {title}')}&footerText=${enc('Page {page} / {pages}')}`);
    expect(decorated.statusCode, decorated.body.slice(0, 200)).toBe(200);
    expect(pages(decorated.rawPayload)).toBe(1);
    expect(decorated.rawPayload.equals(ranged.rawPayload)).toBe(false);
  });

  it('builds header and footer templates from escaped text only', () => {
    const template = headerFooterTemplate('<script>alert(1)</script> {page}/{pages} {evil} "q"');
    expect(template).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(template).toContain('<span class="pageNumber"></span>/<span class="totalPages"></span> {evil} &quot;q&quot;');
    expect(template.match(/<script/g)).toBeNull();
    expect(headerFooterTemplate(null)).toBe('<span></span>');
    expect(parsePageRanges(' 1-3, 5 ')).toBe('1-3,5');
    for (const bad of ['0', '5-2', '101', '1-', 'a', '1;2', Array.from({ length: 11 }, (_, i) => i + 1).join(',')]) {
      expect(() => parsePageRanges(bad), bad).toThrow();
    }
  });

  it('validates the new parameters', async () => {
    for (const query of ['&margin=51', '&margin=-1', '&scale=3', '&scale=0', `&pageRanges=${enc('1-3;drop')}`, '&pageRanges=0', '&pageRanges=9-2', `&headerText=${'x'.repeat(201)}`]) {
      expect((await pdf(query)).statusCode, query).toBe(400);
    }
  });
});
