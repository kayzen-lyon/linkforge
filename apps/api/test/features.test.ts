/**
 * End-to-end tests of the endpoints added after the first release: a real
 * Fastify app, a real Chromium, and a local fixture site (no external host).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/create-app.js';
import { loadConfig } from '../src/config.js';

const SENTENCE = 'The quick brown fox jumps over the lazy dog near the river bank. ';

const RICH_PAGE = `<!doctype html><html lang="en"><head>
  <title>Rich page</title>
  <meta property="og:title" content="Rich OG title">
  <meta property="og:description" content="A page with everything">
  <meta property="og:image" content="/cover.png">
  <meta property="og:video" content="/clip.mp4">
  <meta property="og:video:type" content="video/mp4">
  <meta property="og:audio" content="/sound.mp3">
  <meta name="keywords" content="alpha, beta">
  <link rel="icon" href="/icon.svg">
  <link rel="alternate" type="application/rss+xml" title="Feed" href="/feed.xml">
  <script type="application/ld+json">{"@type":"Organization","name":"Acme","logo":"/logo.png"}</script>
</head><body><h1>Rich</h1><p>${SENTENCE.repeat(6)}</p></body></html>`;

const ARTICLE_PAGE = `<!doctype html><html lang="fr"><head>
  <title>Un article</title><meta name="description" content="Résumé de l'article.">
</head><body>
  <nav><a href="/">MENU PRINCIPAL</a></nav>
  <article><h1>Un article</h1><p>${SENTENCE.repeat(8)}</p>
    <p>Voir <a href="/suite">la suite</a>.</p><pre><code class="language-js">let a = 1;</code></pre></article>
  <aside>BARRE LATERALE</aside><footer>PIED DE PAGE</footer>
</body></html>`;

const SHOP_PAGE = `<!doctype html><html><head><title>Shop</title></head><body>
  <h1 class="name">Blue widget</h1><span class="price">1 299,50 €</span>
  <a href="/a">A</a><a href="/b">B</a>
  <p>${SENTENCE.repeat(6)}</p>
</body></html>`;

/** Server-rendered page whose price only exists after JavaScript runs. */
const SPA_SHOP_PAGE = `<!doctype html><html><head><title>Shop</title></head><body>
  <h1 class="name">Blue widget</h1><span class="price"></span>
  <p>${SENTENCE.repeat(6)}</p>
  <script>document.querySelector('.price').textContent = '$42.00';</script>
</body></html>`;

/** A shell whose article is rendered client-side. */
const SPA_ARTICLE_PAGE = `<!doctype html><html><head><title>App</title></head><body>
  <div id="root"></div>
  <script>
    const article = document.createElement('article');
    article.innerHTML = '<h1>Client article</h1><p>${SENTENCE.repeat(8)}</p>';
    document.getElementById('root').appendChild(article);
  </script>
</body></html>`;

const VISUAL_PAGE = `<!doctype html><html><head><title>Visual</title><style>
  html, body { margin: 0; background: #ffffff; }
  @media (prefers-color-scheme: dark) { html, body { background: #000000; } }
  #box { width: 200px; height: 100px; background: #c00; }
  #banner { width: 100%; height: 60px; background: #0c0; }
  #late { width: 100px; height: 50px; background: #00c; }
  @media print { #banner { background: #ff0; } }
</style></head><body>
  <div id="banner" class="cookie">Cookies!</div>
  <div id="box">Box</div>
  <div id="late">Late</div>
  <div id="ghost" style="display:none">Hidden</div>
  <script>setTimeout(() => { document.getElementById('late').style.width = '300px'; }, 2500);</script>
</body></html>`;

const LONG_PAGE = `<!doctype html><html><head><title>Long</title></head><body>
  ${`<p>${SENTENCE.repeat(40)}</p>`.repeat(60)}
</body></html>`;

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const PAGES: Readonly<Record<string, string>> = {
  '/rich': RICH_PAGE,
  '/article': ARTICLE_PAGE,
  '/shop': SHOP_PAGE,
  '/spa-shop': SPA_SHOP_PAGE,
  '/spa-article': SPA_ARTICLE_PAGE,
  '/visual': VISUAL_PAGE,
  '/long': LONG_PAGE,
};

let fixture: Server;
let origin: string;
let app: FastifyInstance;
const hits = new Map<string, number>();

const TEST_ENV = {
  NODE_ENV: 'test',
  SSRF_ALLOW_PRIVATE_NETWORKS: 'true',
  SSRF_ALLOWED_PORTS: '*',
  HTTP_TIMEOUT_MS: '1500',
  RATE_LIMIT_MAX: '1000',
} as const;

beforeAll(async () => {
  fixture = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture').pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const page = PAGES[path];
    if (page !== undefined) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
    } else if (path === '/pixel.png') {
      res.writeHead(200, { 'content-type': 'image/png' }).end(PIXEL_PNG);
    } else {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not found</h1>');
    }
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
  app = await buildApp(loadConfig(TEST_ENV));
});

afterAll(async () => {
  await app.close();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
});

const enc = encodeURIComponent;
const get = (path: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: path, headers });
const target = (path: string) => enc(`${origin}${path}`);
const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe('GET /api/v1/meta — new fields', () => {
  it('returns logo, video, audio, keywords and feeds', async () => {
    const res = await get(`/api/v1/meta?url=${target('/rich')}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      logo: { url: `${origin}/logo.png` },
      video: { url: `${origin}/clip.mp4`, type: 'video/mp4', width: null, height: null },
      audio: { url: `${origin}/sound.mp3`, type: null },
      keywords: ['alpha', 'beta'],
      feeds: [{ url: `${origin}/feed.xml`, title: 'Feed', type: 'application/rss+xml' }],
    });
  });

  it('returns empty values when the page declares none', async () => {
    const res = await get(`/api/v1/meta?url=${target('/shop')}&render=never`);
    expect(res.json().data).toMatchObject({
      logo: null,
      video: null,
      audio: null,
      keywords: [],
      feeds: [],
    });
  });
});

describe('GET /api/v1/meta?embed=', () => {
  const embed = (path: string) => get(`/api/v1/meta?url=${target('/rich')}&embed=${path}`);

  it('redirects to URL values, so the endpoint works as an <img src>', async () => {
    for (const [path, location] of [
      ['image.url', '/cover.png'],
      ['logo.url', '/logo.png'],
      ['favicon', '/icon.svg'],
      ['images.0.url', '/cover.png'],
    ] as const) {
      const res = await embed(path);
      expect(res.statusCode).toBe(302);
      expect(res.headers['location']).toBe(`${origin}${location}`);
      expect(res.headers['cache-control']).toContain('max-age=3600');
    }
  });

  it('answers text/plain for scalars', async () => {
    const res = await embed('title');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toBe('Rich OG title');
  });

  it('answers raw JSON for objects and arrays', async () => {
    const res = await embed('keywords');
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json()).toEqual(['alpha', 'beta']);
  });

  it.each(['author', 'image.width', 'nope', 'title.length', 'constructor', 'images.9.url'])(
    'answers 404 EEMBEDNOTFOUND for %s',
    async (path) => {
      const res = await embed(path);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ status: 'fail', code: 'EEMBEDNOTFOUND' });
      expect(res.headers['cache-control']).toBeUndefined();
    },
  );

  it('rejects a malformed path with 400', async () => {
    for (const path of ['a..b', '.a', enc('a b'), enc('a[0]'), 'x'.repeat(101)]) {
      const res = await embed(path);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EINVALIDPARAMS');
    }
  });
});

describe('ttl parameter', () => {
  it.each([
    ['meta', ''],
    ['content', ''],
    ['extract', `&fields=${enc('{"t":{"selector":"h1"}}')}`],
    ['screenshot', ''],
    ['pdf', ''],
  ])('drives Cache-Control on /%s', async (endpoint, extra) => {
    const res = await get(`/api/v1/${endpoint}?url=${target('/shop')}${extra}&ttl=120`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=120, s-maxage=120');
  });

  it('is bounded to 60..86400 seconds', async () => {
    for (const ttl of ['59', '86401', '0', 'abc', '120.5']) {
      const res = await get(`/api/v1/meta?url=${target('/shop')}&ttl=${ttl}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EINVALIDPARAMS');
    }
    expect((await get(`/api/v1/meta?url=${target('/shop')}&ttl=86400`)).statusCode).toBe(200);
  });
});

describe('GET /api/v1/screenshot — new options', () => {
  const shot = (query: string) => get(`/api/v1/screenshot?url=${target('/visual')}${query}`);

  it('overrides the viewport size', async () => {
    const res = await shot('&width=800&height=600');
    expect(res.statusCode).toBe(200);
    expect(pngSize(res.rawPayload)).toEqual({ width: 800, height: 600 });

    // One dimension only: the other keeps the device preset's value.
    expect(pngSize((await shot('&width=640')).rawPayload)).toEqual({ width: 640, height: 800 });
  });

  it('rejects out-of-range dimensions and waits', async () => {
    for (const query of ['&width=319', '&width=2561', '&height=239', '&height=2161', '&waitFor=10001', '&waitFor=-1', '&colorScheme=sepia']) {
      const res = await shot(query);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EINVALIDPARAMS');
    }
  });

  it('captures a single element with selector', async () => {
    const res = await shot(`&selector=${enc('#box')}`);
    expect(res.statusCode).toBe(200);
    expect(pngSize(res.rawPayload)).toEqual({ width: 200, height: 100 });
  });

  it('answers 404 ESELECTORNOTFOUND when nothing visible matches', async () => {
    for (const selector of ['#nope', '#ghost']) {
      const res = await shot(`&selector=${enc(selector)}`);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ status: 'fail', code: 'ESELECTORNOTFOUND' });
    }
  });

  it('answers 400 for a selector that is not CSS', async () => {
    for (const selector of ['div[', 'xpath=//div', 'text=Box']) {
      const res = await shot(`&selector=${enc(selector)}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EINVALIDPARAMS');
    }
  });

  it('waits before capturing with waitFor', async () => {
    const early = await shot(`&selector=${enc('#late')}`);
    expect(pngSize(early.rawPayload).width).toBe(100);

    const late = await shot(`&selector=${enc('#late')}&waitFor=3500`);
    expect(pngSize(late.rawPayload).width).toBe(300);
  });

  it('emulates the colour scheme', async () => {
    const light = await shot('&colorScheme=light&width=320&height=240');
    const dark = await shot('&colorScheme=dark&width=320&height=240');
    expect(dark.statusCode).toBe(200);
    expect(dark.rawPayload.equals(light.rawPayload)).toBe(false);
  });

  it('hides elements before the capture', async () => {
    const base = await shot('&width=320&height=240');
    const hidden = await shot(`&width=320&height=240&hide=${enc('.cookie, #nothing-here')}`);
    expect(hidden.statusCode).toBe(200);
    expect(hidden.rawPayload.equals(base.rawPayload)).toBe(false);

    // Hidden for real: the element can no longer be captured.
    const gone = await shot(`&selector=${enc('#banner')}&hide=${enc('#banner')}`);
    expect(gone.json().code).toBe('ESELECTORNOTFOUND');
  });

  it('refuses hide values that could inject CSS', async () => {
    for (const hide of ['.a{color:red}', '.a } * { display:none', '@import url(//x)', 'a;b']) {
      const res = await shot(`&hide=${enc(hide)}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EINVALIDPARAMS');
    }
  });

  it('keys the cache on every new option', async () => {
    const variants = [
      '&width=400&height=300',
      '&width=401&height=300',
      '&width=400&height=301',
      `&width=400&height=300&selector=${enc('#box')}`,
      '&width=400&height=300&waitFor=1',
      '&width=400&height=300&colorScheme=dark',
      `&width=400&height=300&hide=${enc('#box')}`,
    ];
    for (const variant of variants) {
      expect((await shot(variant)).headers['x-cache']).toBe('MISS');
    }
    for (const variant of variants) {
      expect((await shot(variant)).headers['x-cache']).toBe('HIT');
    }
  });
});

describe('GET /api/v1/pdf', () => {
  const mediaBox = (pdf: Buffer) => {
    const match = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
    return match === null ? null : { width: Math.round(Number(match[1])), height: Math.round(Number(match[2])) };
  };

  it('prints an A4 portrait PDF by default and caches it', async () => {
    const path = `/api/v1/pdf?url=${target('/visual')}`;
    const res = await get(path);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(mediaBox(res.rawPayload)).toEqual({ width: 596, height: 843 });

    expect((await get(path)).headers['x-cache']).toBe('HIT');
    expect((await get(`${path}&force=true`)).headers['x-cache']).toBe('MISS');
  });

  it('supports Letter and landscape', async () => {
    const letter = await get(`/api/v1/pdf?url=${target('/visual')}&format=Letter`);
    expect(mediaBox(letter.rawPayload)).toEqual({ width: 612, height: 792 });

    const landscape = await get(`/api/v1/pdf?url=${target('/visual')}&landscape=true`);
    expect(landscape.headers['x-cache']).toBe('MISS');
    expect(mediaBox(landscape.rawPayload)).toEqual({ width: 843, height: 596 });
  });

  it('honours printBackground', async () => {
    const withBackground = await get(`/api/v1/pdf?url=${target('/visual')}&printBackground=true`);
    const without = await get(`/api/v1/pdf?url=${target('/visual')}&printBackground=false`);
    expect(without.statusCode).toBe(200);
    expect(without.headers['x-cache']).toBe('MISS');
    expect(without.rawPayload.equals(withBackground.rawPayload)).toBe(false);
  });

  it('rejects invalid parameters', async () => {
    for (const query of ['&format=A3', '&landscape=maybe']) {
      const res = await get(`/api/v1/pdf?url=${target('/visual')}${query}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EINVALIDPARAMS');
    }
    expect((await get('/api/v1/pdf')).statusCode).toBe(400);
  });

  it('reports target HTTP errors as 502', async () => {
    const res = await get(`/api/v1/pdf?url=${target('/missing')}`);
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('ETARGETSTATUS');
  });

  it('refuses a document above the size limit with ETOOLARGE', async () => {
    const small = await buildApp(loadConfig({ ...TEST_ENV, PDF_MAX_BYTES: '2048' }));
    try {
      const res = await small.inject(`/api/v1/pdf?url=${target('/long')}`);
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ status: 'fail', code: 'ETOOLARGE' });
    } finally {
      await small.close();
    }
  });
});

describe('GET /api/v1/extract', () => {
  const extract = (page: string, fields: unknown, extra = '') =>
    get(
      `/api/v1/extract?url=${target(page)}&fields=${enc(
        typeof fields === 'string' ? fields : JSON.stringify(fields),
      )}${extra}`,
    );

  it('applies the rules over plain HTTP and caches the result', async () => {
    const fields = {
      name: { selector: '.name' },
      price: { selector: '.price', attr: 'text', type: 'number' },
      links: { selector: 'a', attr: 'href', type: 'url', all: true },
      missing: { selector: '.nope' },
    };
    const res = await extract('/shop', fields);
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.json()).toMatchObject({
      status: 'success',
      data: {
        url: `${origin}/shop`,
        fields: {
          name: 'Blue widget',
          price: 1299.5,
          links: [`${origin}/a`, `${origin}/b`],
          missing: null,
        },
      },
      meta: { cached: false, source: 'http' },
    });
    expect((await extract('/shop', fields)).json().meta.cached).toBe(true);
  });

  it('renders in the browser when a field is only filled by JavaScript', async () => {
    const fields = { price: { selector: '.price', type: 'number' } };

    const auto = await extract('/spa-shop', fields);
    expect(auto.json()).toMatchObject({ data: { fields: { price: 42 } }, meta: { source: 'browser' } });

    const never = await extract('/spa-shop', fields, '&render=never');
    expect(never.json()).toMatchObject({ data: { fields: { price: null } }, meta: { source: 'http' } });

    const always = await extract('/shop', { name: { selector: '.name' } }, '&render=always');
    expect(always.json()).toMatchObject({
      data: { fields: { name: 'Blue widget' } },
      meta: { source: 'browser' },
    });
  });

  it.each([
    ['not JSON', 'price'],
    ['not an object', '["a"]'],
    ['an invalid selector', '{"a":{"selector":"div["}}'],
    ['an unknown type', '{"a":{"selector":"p","type":"date"}}'],
    ['too many fields', JSON.stringify(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`f${i}`, { selector: 'p' }])))],
  ])('answers 400 when fields is %s', async (_, fields) => {
    const before = hits.get('/shop') ?? 0;
    const res = await extract('/shop', fields, '&force=true');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ status: 'fail', code: 'EINVALIDPARAMS' });
    // Refused before any request leaves the server.
    expect(hits.get('/shop') ?? 0).toBe(before);
  });

  it('requires url and fields', async () => {
    expect((await get(`/api/v1/extract?url=${target('/shop')}`)).statusCode).toBe(400);
    expect((await get(`/api/v1/extract?fields=${enc('{"a":{"selector":"p"}}')}`)).statusCode).toBe(400);
  });

  it('answers 422 ENOTHTML for a non-HTML target', async () => {
    for (const render of ['auto', 'always']) {
      const res = await extract('/pixel.png', { a: { selector: 'p' } }, `&render=${render}`);
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ status: 'fail', code: 'ENOTHTML' });
    }
  });

  it('reports target HTTP errors as 502', async () => {
    const res = await extract('/missing', { a: { selector: 'p' } });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('ETARGETSTATUS');
  });
});

describe('GET /api/v1/content', () => {
  it('returns the readable content as text and Markdown', async () => {
    const res = await get(`/api/v1/content?url=${target('/article')}`);
    expect(res.statusCode).toBe(200);
    const { data, meta } = res.json();
    expect(meta).toMatchObject({ cached: false, source: 'http' });
    expect(Object.keys(data).sort()).toEqual(
      [
        'excerpt', 'images', 'lang', 'links', 'markdown', 'readingTimeMinutes', 'text', 'title',
        'truncated', 'url', 'wordCount',
      ],
    );
    expect(data).toMatchObject({
      url: `${origin}/article`,
      title: 'Un article',
      lang: 'fr',
      excerpt: "Résumé de l'article.",
      readingTimeMinutes: 1,
    });
    expect(data.wordCount).toBeGreaterThan(100);
    expect(data.markdown).toContain('# Un article');
    expect(data.markdown).toContain(`[la suite](${origin}/suite)`);
    expect(data.markdown).toContain('```js\nlet a = 1;\n```');
    for (const noise of ['MENU PRINCIPAL', 'BARRE LATERALE', 'PIED DE PAGE']) {
      expect(data.text).not.toContain(noise);
      expect(data.markdown).not.toContain(noise);
    }
    expect((await get(`/api/v1/content?url=${target('/article')}`)).headers['x-cache']).toBe('HIT');
  });

  it('renders client-side content in the browser, unless render=never', async () => {
    const auto = await get(`/api/v1/content?url=${target('/spa-article')}`);
    expect(auto.json().meta.source).toBe('browser');
    expect(auto.json().data.markdown).toContain('# Client article');

    const never = await get(`/api/v1/content?url=${target('/spa-article')}&render=never`);
    expect(never.json()).toMatchObject({ data: { text: '', wordCount: 0 }, meta: { source: 'http' } });
  });

  it('answers 422 ENOTHTML for a non-HTML target and 400 without url', async () => {
    const res = await get(`/api/v1/content?url=${target('/pixel.png')}`);
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('ENOTHTML');
    expect((await get('/api/v1/content')).json().code).toBe('EINVALIDPARAMS');
  });
});

describe('SSRF protection on the new endpoints (strict policy)', () => {
  let strictApp: FastifyInstance;
  const FIELDS = `&fields=${enc('{"a":{"selector":"p"}}')}`;

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
    'http://10.0.0.1:8080/',
  ])('refuses %s on /pdf, /extract and /content', async (url) => {
    for (const path of ['pdf?', `extract?${FIELDS.slice(1)}&`, 'content?', 'content?render=always&', `extract?render=always${FIELDS}&`]) {
      const res = await strictApp.inject(`/api/v1/${path}url=${enc(url)}`);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('EFORBIDDENURL');
    }
  });

  it('refuses embed lookups on forbidden targets too', async () => {
    const res = await strictApp.inject(`/api/v1/meta?embed=image.url&url=${enc('http://127.0.0.1/')}`);
    expect(res.statusCode).toBe(403);
  });
});

describe('x-request-id', () => {
  it('is generated on every response, errors included', async () => {
    const ids = new Set<string>();
    for (const path of ['/health', '/api/v1/meta', '/api/v1/nope', `/api/v1/meta?url=${enc('ftp://x')}`, '/api/v1/openapi.json']) {
      const id = (await get(path)).headers['x-request-id'];
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      ids.add(id as string);
    }
    expect(ids.size).toBe(5);
  });

  it('echoes a well-formed client id and replaces anything else', async () => {
    const echoed = await get('/health', { 'x-request-id': 'trace-123.abc:7' });
    expect(echoed.headers['x-request-id']).toBe('trace-123.abc:7');

    for (const bad of ['has space', 'x'.repeat(129), '<script>', '']) {
      const res = await get('/health', { 'x-request-id': bad });
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe('API keys', () => {
  const KEY_A = 'test-key-aaaaaaaaaaaaaaaa';
  const KEY_B = 'test-key-bbbbbbbbbbbbbbbb';
  const PATH = '/api/v1/openapi.json';
  let keyed: FastifyInstance;

  const boot = (anonymousMax = '3') =>
    buildApp(
      loadConfig({
        NODE_ENV: 'test',
        API_KEYS: `${KEY_A},${KEY_B}`,
        RATE_LIMIT_MAX: anonymousMax,
        RATE_LIMIT_KEY_MAX: '6',
      }),
    );
  const call = (key?: string) =>
    keyed.inject({ method: 'GET', url: PATH, headers: key === undefined ? {} : { 'x-api-key': key } });
  const statuses = async (count: number, key?: string) => {
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) out.push((await call(key)).statusCode);
    return out;
  };

  beforeAll(async () => {
    keyed = await boot();
  });
  afterAll(() => keyed.close());

  it('applies the anonymous limit without a key', async () => {
    expect(await statuses(4)).toEqual([200, 200, 200, 429]);
    const limited = await call();
    expect(limited.json()).toMatchObject({ status: 'fail', code: 'ERATELIMIT' });
    expect(limited.headers['x-request-id']).toBeDefined();
  });

  it('applies the higher limit to a valid key, keyed by the key rather than the IP', async () => {
    // The anonymous bucket of this IP is already exhausted by the previous test.
    expect(await statuses(7, KEY_A)).toEqual([200, 200, 200, 200, 200, 200, 429]);
    const res = await call(KEY_B);
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('6');
  });

  it('answers 401 EUNAUTHORIZED for an unknown key', async () => {
    const fresh = await boot('100');
    try {
      for (const key of ['wrong-key-aaaaaaaaaaaaaaa', KEY_A.slice(0, -1), `${KEY_A}x`, '']) {
        const res = await fresh.inject({ method: 'GET', url: PATH, headers: { 'x-api-key': key } });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toMatchObject({ status: 'fail', code: 'EUNAUTHORIZED' });
      }
    } finally {
      await fresh.close();
    }
  });

  it('counts guesses against the caller IP, so keys cannot be brute-forced freely', async () => {
    const fresh = await boot();
    try {
      const seen: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await fresh.inject({ method: 'GET', url: PATH, headers: { 'x-api-key': `guess-${i}-aaaaaaaaaaaa` } });
        seen.push(res.statusCode);
      }
      expect(seen).toEqual([401, 401, 401, 429, 429]);
    } finally {
      await fresh.close();
    }
  });

  it('ignores the header altogether when no key is configured', async () => {
    const res = await get(PATH, { 'x-api-key': 'whatever' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('1000');
  });
});
