/**
 * Regression tests of the hardening release: pure extractors first, then the
 * HTTP contract against a local fixture site (real Chromium, no external host).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/create-app.js';
import { detectBlockPage } from '../src/lib/block-page.js';
import { Deadline } from '../src/lib/deadline.js';
import { htmlToMarkdown, largestSrcsetCandidate } from '../src/lib/html-to-markdown.js';
import { assertCssSelector } from '../src/lib/selectors.js';
import { isAdOrTracker } from '../src/security/browser-guard.js';
import { countWords, extractContent } from '../src/services/content-extractor.js';
import { extractMetadata, toIsoDate, toLanguageTag } from '../src/services/meta-extractor.js';

const SENTENCE = 'The quick brown fox jumps over the lazy dog near the river bank. ';
const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const URL_ = 'https://example.com/post';

describe('content extraction: verified bugs', () => {
  it('keeps a page whose whole body sits in a <form> (ASP.NET WebForms)', () => {
    const html = page(
      '<title>WebForms</title>',
      `<form id="aspnetForm" method="post"><input type="hidden" name="__VIEWSTATE" value="x">
         <div><h1>Annual report</h1><p>${SENTENCE.repeat(5)}</p></div></form>`,
    );
    const content = extractContent(html, URL_);
    expect(content.text).toContain('Annual report');
    expect(content.wordCount).toBeGreaterThan(50);
    // A small form inside real content is still chrome.
    const mixed = extractContent(
      page('', `<article><p>${SENTENCE.repeat(5)}</p><form><p>SUBSCRIBE NOW</p></form></article>`),
      URL_,
    );
    expect(mixed.text).not.toContain('SUBSCRIBE');
  });

  it('keeps content wrapped in aria-hidden or <dialog> when it is most of the page', () => {
    for (const wrapper of ['<div aria-hidden="true">', '<dialog open>', '<div class="modal">']) {
      const closing = wrapper.startsWith('<dialog') ? '</dialog>' : '</div>';
      const html = page('', `${wrapper}<h1>Story</h1><p>${SENTENCE.repeat(5)}</p>${closing}<p>tail</p>`);
      expect(extractContent(html, URL_).text, wrapper).toContain('quick brown fox');
    }
  });

  it('falls back to the whole body rather than answering empty', () => {
    const html = page('', '<nav><p>Only navigation here, but it is all the page has.</p></nav><aside>More</aside>');
    expect(extractContent(html, URL_).text).toContain('Only navigation here');
  });

  it('counts words in CJK text instead of whitespace-separated runs', () => {
    const chinese = '今天天气很好，我们一起去公园散步吧。'.repeat(30);
    expect(chinese.split(/\s+/).length).toBe(1);
    expect(countWords(chinese, 'zh')).toBeGreaterThan(150);
    expect(countWords('one two  three', 'en')).toBe(3);
    const content = extractContent(page('<html lang="zh">', `<article><p>${chinese}</p></article>`), URL_);
    expect(content.wordCount).toBeGreaterThan(150);
    expect(content.readingTimeMinutes).toBeGreaterThanOrEqual(1);
  });

  it('keeps every article of a multi-article page', () => {
    const article = (n: number) => `<article><h2>Post ${n}</h2><p>${SENTENCE.repeat(3 + n)}</p></article>`;
    const html = page('', `<nav>MENU</nav><div>${article(1)}${article(2)}${article(3)}</div><footer>FOOT</footer>`);
    const { text } = extractContent(html, URL_);
    expect(text).toContain('Post 1');
    expect(text).toContain('Post 2');
    expect(text).toContain('Post 3');
    expect(text).not.toContain('MENU');
    // One dominant article with small teasers stays alone.
    const dominant = page('', `<article><h1>Main</h1><p>${SENTENCE.repeat(30)}</p></article><article><p>Teaser only</p></article>`);
    expect(extractContent(dominant, URL_).text).not.toContain('Teaser only');
  });

  it('removes furniture by class/id tokens, not by substring', () => {
    const html = page(
      '',
      `<div id="page"><div class="share-buttons">SHARE THIS</div><div class="cookieNotice">COOKIES</div>
       <div class="shareholder-letter"><p>${SENTENCE.repeat(6)}</p></div>
       <div class="related_posts">RELATED</div></div>`,
    );
    const { text } = extractContent(html, URL_);
    expect(text).toContain('quick brown fox');
    for (const noise of ['SHARE THIS', 'COOKIES', 'RELATED']) expect(text).not.toContain(noise);
  });

  it('supports mainContent=false, include, exclude and citations', () => {
    const html = page(
      '',
      `<nav><a href="/home">HOME</a></nav><article><h1>Title</h1><p class="lead">${SENTENCE.repeat(4)}</p>
       <p class="ad">BUY NOW</p><p>See <a href="/a?x=1">the docs</a> and <a href="https://other.org/b">elsewhere</a>,
       again <a href="/a?x=1">the docs</a>.</p></article>`,
    );
    expect(extractContent(html, URL_, { mainContent: false }).text).toContain('HOME');
    expect(extractContent(html, URL_).text).not.toContain('HOME');
    expect(extractContent(html, URL_, { exclude: ['.ad'] }).text).not.toContain('BUY NOW');
    const included = extractContent(html, URL_, { include: ['.lead', 'nav'] });
    expect(included.text).toContain('HOME');
    expect(included.text).not.toContain('Title');

    const cited = extractContent(html, URL_, { citations: true });
    expect(cited.markdown).toContain('[the docs][1]');
    expect(cited.markdown).toContain('[elsewhere][2]');
    expect(cited.markdown.endsWith('[1]: https://example.com/a?x=1\n[2]: https://other.org/b')).toBe(true);
    expect(cited.links).toEqual([
      { url: 'https://example.com/a?x=1', text: 'the docs', internal: true },
      { url: 'https://other.org/b', text: 'elsewhere', internal: false },
    ]);
    expect(cited.truncated).toBe(false);
  });

  it('flags truncated output', () => {
    const html = page('', `<article>${`<p>${SENTENCE.repeat(100)}</p>`.repeat(90)}</article>`);
    const content = extractContent(html, URL_);
    expect(content.truncated).toBe(true);
    expect(content.text.length).toBeLessThanOrEqual(500_001);
  });
});

describe('Markdown: verified bugs', () => {
  const md = (html: string) => htmlToMarkdown(html, { baseUrl: 'https://example.com/dir/' });

  it('does not corrupt URLs and identifiers with escapes', () => {
    expect(md('<p>See https://example.com/a_b_c?x_y=1 and user_name or MAX_BODY_BYTES</p>')).toBe(
      'See https://example.com/a_b_c?x_y=1 and user_name or MAX_BODY_BYTES',
    );
    // Where Markdown would interpret them, they are still escaped.
    expect(md('<p>_emphasis_ and *stars* and a_ b</p>')).toBe('\\_emphasis\\_ and \\*stars\\* and a\\_ b');
    expect(md('<p>* not a list</p>')).toBe('\\* not a list');
    expect(md('<p>1 < 2 and <tag></p>')).toBe('1 < 2 and');
    expect(md('<p>1 &lt; 2 and &lt;tag&gt;</p>')).toBe('1 < 2 and \\<tag>');
  });

  it('resolves srcset, data-src and <picture>, picks the largest, drops data: URIs', () => {
    expect(largestSrcsetCandidate('a.jpg 320w, b.jpg 1280w, c.jpg 640w')).toBe('b.jpg');
    expect(largestSrcsetCandidate('a.jpg 1x,b.jpg 3x, c.jpg 2x')).toBe('b.jpg');
    expect(largestSrcsetCandidate('https://x/a,b.jpg 2x, data:image/png;base64,AAAA 3x')).toBe('https://x/a,b.jpg');

    expect(md('<img src="small.jpg" srcset="m.jpg 640w, /big.jpg 1920w" alt="A">')).toBe(
      '![A](https://example.com/big.jpg)',
    );
    expect(md('<img src="data:image/gif;base64,R0lGOD" data-src="real.jpg" alt="Lazy">')).toBe(
      '![Lazy](https://example.com/dir/real.jpg)',
    );
    expect(md('<img src="data:image/gif;base64,R0lGOD" data-srcset="l.jpg 1x, xl.jpg 2x">')).toBe(
      '![](https://example.com/dir/xl.jpg)',
    );
    expect(
      md('<picture><source srcset="p.webp 800w, p2.webp 1600w"><img src="fallback.jpg" alt="P"></picture>'),
    ).toBe('![P](https://example.com/dir/p2.webp)');
    expect(md('<p>x <img src="data:image/png;base64,AAAA" alt="inline"> y</p>')).toBe('x y');
  });

  it('lists the images of the content with the same resolution', () => {
    const content = extractContent(
      page('', `<article><p>${SENTENCE.repeat(4)}</p><img src="s.jpg" srcset="/l.jpg 2x" alt="One">
        <img src="/l.jpg" alt="dup"><img src="data:image/png;base64,AA"></article>`),
      URL_,
    );
    expect(content.images).toEqual([{ url: 'https://example.com/l.jpg', alt: 'One' }]);
  });
});

describe('metadata: verified bugs', () => {
  it('reads og:image declared with name=, whatever the case', () => {
    const meta = extractMetadata(
      page(`<meta name="og:image" content="/a.png"><meta name="og:image:width" content="800">
            <meta property="OG:Title" content="Mixed case"><meta NAME="Twitter:Card" content="summary">`),
      URL_,
    );
    expect(meta.image).toMatchObject({ url: 'https://example.com/a.png', width: 800 });
    expect(meta.title).toBe('Mixed case');
    expect(meta.twitter.card).toBe('summary');
  });

  it('refuses bogus dates and accepts epochs', () => {
    expect(toIsoDate('12')).toBeNull();
    expect(toIsoDate('May 5')).toBeNull();
    expect(toIsoDate('yesterday')).toBeNull();
    expect(toIsoDate('2024')).toBeNull();
    expect(toIsoDate('2024-05-05')).toBe('2024-05-05T00:00:00.000Z');
    expect(toIsoDate('2024-05-05T10:00:00+02:00')).toBe('2024-05-05T08:00:00.000Z');
    expect(toIsoDate('1714903200')).toBe('2024-05-05T10:00:00.000Z');
    expect(toIsoDate('1714903200000')).toBe('2024-05-05T10:00:00.000Z');
    expect(toIsoDate('May 5, 2024')).toMatch(/^2024-05-0[45]T/);
    // A junk first candidate must not hide a valid later one.
    const meta = extractMetadata(
      page('<meta property="article:published_time" content="12"><meta name="date" content="2023-01-02">'),
      URL_,
    );
    expect(meta.date).toBe('2023-01-02T00:00:00.000Z');
  });

  it('normalises lang to BCP 47', () => {
    expect(toLanguageTag('en_US')).toBe('en-US');
    expect(toLanguageTag('FR-fr')).toBe('fr-FR');
    expect(toLanguageTag('not a lang!')).toBeNull();
    expect(extractMetadata(page('<meta property="og:locale" content="pt_BR">'), URL_).lang).toBe('pt-BR');
  });

  it('prefers the JSON-LD node describing the page, and tolerates CDATA / comments', () => {
    const html = page(`
      <script type="application/ld+json">//<![CDATA[
        {"@type":"Organization","name":"Acme","description":"We make everything."}
      //]]></script>
      <script type="application/ld+json"><!--
        {"@type":"NewsArticle","headline":"Real headline","description":"About this article.",
         "datePublished":"2024-03-01","dateModified":"2024-03-02","isAccessibleForFree":false,
         "author":{"name":"Ada"}}
      --></script>`);
    const meta = extractMetadata(html, URL_);
    expect(meta.jsonLd).toHaveLength(2);
    expect(meta.description).toBe('About this article.');
    expect(meta.title).toBe('Real headline');
    expect(meta.dateModified).toBe('2024-03-02T00:00:00.000Z');
    expect(meta.paywalled).toBe(true);
    expect(meta.type).toBe('NewsArticle');
    expect(meta.publisher).toBeNull();
  });

  it('extracts the new fields', () => {
    const meta = extractMetadata(
      page(`<meta property="og:type" content="article"><meta name="theme-color" content="#102030">
        <meta name="robots" content="noindex, nofollow"><meta name="twitter:site" content="@acme">
        <meta property="article:modified_time" content="2024-06-01T00:00:00Z">
        <link rel="alternate" type="application/json+oembed" href="/oembed?format=json">
        <link rel="alternate" type="text/xml+oembed" href="/oembed?format=xml">
        <link rel="alternate" hreflang="fr_FR" href="/fr"><link rel="alternate" hreflang="x-default" href="/">`),
      'https://www.example.com/post',
    );
    expect(meta).toMatchObject({
      type: 'article',
      themeColor: '#102030',
      robots: 'noindex, nofollow',
      oembed: 'https://www.example.com/oembed?format=json',
      alternates: [
        { lang: 'fr-FR', url: 'https://www.example.com/fr' },
        { lang: 'x-default', url: 'https://www.example.com/' },
      ],
      twitter: { card: null, site: '@acme' },
      dateModified: '2024-06-01T00:00:00.000Z',
      paywalled: null,
      domain: 'example.com',
    });
  });
});

describe('block-page detection', () => {
  const filler = `<p>${SENTENCE.repeat(60)}</p>`;

  it('trusts strong markers on a page of any size', () => {
    const cloudflare = page('<title>Just a moment...</title>', `<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>${filler}`);
    expect(detectBlockPage(cloudflare)).toEqual({ blocked: true, reason: 'challenge:cloudflare' });
    expect(detectBlockPage(page('', `<script src="https://geo.captcha-delivery.com/captcha/"></script>${filler}`)).blocked).toBe(true);
    expect(detectBlockPage(page('', `<div id="px-captcha"></div>${filler}`)).blocked).toBe(true);
  });

  it('counts generic phrases only on small pages', () => {
    expect(detectBlockPage(page('<title>Access Denied</title>', '<h1>Access Denied</h1><p>You don\'t have permission.</p>')).blocked).toBe(true);
    expect(detectBlockPage(page('', '<p>Please verify you are human to continue.</p>')).blocked).toBe(true);
    // An article that discusses the topic is not a block page.
    const article = page('<title>Why sites say "access denied"</title>', `<article><p>Access denied errors, explained. Verify you are human, they say.</p>${filler}</article>`);
    expect(detectBlockPage(article).blocked).toBe(false);
  });

  it('detects structural emptiness around a CAPTCHA, and leaves ordinary pages alone', () => {
    expect(detectBlockPage(page('<title>Hold on</title>', '<div class="g-recaptcha"></div><script src="https://x/recaptcha/api.js?captcha"></script>')).blocked).toBe(true);
    expect(detectBlockPage(page('<title>Shop</title>', `<h1>Shop</h1>${filler}<div class="g-recaptcha"></div>`)).blocked).toBe(false);
    expect(detectBlockPage(page('<title>App</title>', '<div id="root"></div><script src="/app.js"></script>')).blocked).toBe(false);
  });
});

describe('selectors and deadline', () => {
  it('accepts CSS only', () => {
    expect(assertCssSelector(' main > a[href^="/x"] ', 'selector')).toBe('main > a[href^="/x"]');
    for (const bad of ['xpath=//a', 'text=Hello', '//div', 'internal:has-text="x"', 'a >> b', 'a{}', '']) {
      expect(() => assertCssSelector(bad, 'selector'), bad).toThrow(/selector/);
    }
  });

  it('derives step budgets from one deadline', () => {
    const deadline = new Deadline(10_000);
    expect(deadline.budget(20_000)).toBeLessThanOrEqual(10_000);
    expect(deadline.budget(20_000, 4000)).toBeLessThanOrEqual(6000);
    expect(deadline.budget(1000, 4000)).toBe(1000);
    expect(deadline.budget(5000, 60_000)).toBe(0);
  });
});

// --- HTTP contract ---------------------------------------------------------

const CHALLENGE = page('<title>Just a moment...</title>', '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script><noscript>Enable JavaScript and cookies to continue</noscript>');
const LAZY = `<!doctype html><html><head><title>Lazy</title><style>
  html, body { margin: 0; background: #fff; } .spacer { height: 9000px; }
  #lazy { display: block; width: 300px; height: 300px; }
  #cookie-banner { position: fixed; top: 0; left: 0; width: 100%; height: 120px; background: #f00; }
</style></head><body>
  <div id="cookie-banner">We use cookies</div>
  <div class="spacer"></div><img id="lazy" loading="lazy" src="/red.svg" alt="lazy"><div style="height:300px"></div>
</body></html>`;
const RED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#00ff00"/></svg>';
const HANGING = page('<title>Hanging</title>', `<h1 id="ready">Rendered</h1><p>${SENTENCE.repeat(6)}</p><script src="/never.js"></script><img src="/never.png">`);
const LATE = page('<title>Late</title>', `<p>${SENTENCE.repeat(6)}</p><script>setTimeout(() => { const d = document.createElement('div'); d.id = 'late'; d.textContent = 'ARRIVED'; document.body.appendChild(d); }, 800);</script>`);
const ARTICLE = page('<title>Agent article</title><meta name="description" content="Desc">', `<nav>MENU</nav><article><h1>Agent article</h1><p>${SENTENCE.repeat(8)}</p><p><a href="/next">Next</a> <a href="https://elsewhere.test/x">Out</a></p><img src="/pic.png" alt="Pic"></article>`);

let fixture: Server;
let origin: string;
let app: FastifyInstance;
const hits = new Map<string, number>();

function start(env: Record<string, string> = {}): Promise<FastifyInstance> {
  return buildApp(
    loadConfig({
      NODE_ENV: 'test',
      SSRF_ALLOW_PRIVATE_NETWORKS: 'true',
      SSRF_ALLOWED_PORTS: '*',
      HTTP_TIMEOUT_MS: '1500',
      RATE_LIMIT_MAX: '1000',
      ...env,
    }),
  );
}

beforeAll(async () => {
  fixture = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixture').pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const html = (body: string, status = 200) => res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    if (path === '/challenge') html(CHALLENGE);
    else if (path === '/challenge-403') html(CHALLENGE, 403);
    else if (path === '/lazy') html(LAZY);
    else if (path === '/red.svg') res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(RED_SVG);
    else if (path === '/hanging') html(HANGING);
    else if (path === '/late') html(LATE);
    else if (path === '/article') html(ARTICLE);
    else if (path === '/photo.png') res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from([0x89, 0x50]));
    else if (path === '/never.js' || path === '/never.png') { /* never answers */ }
    else html('<h1>Not found</h1>', 404);
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}`;
  app = await start();
});

afterAll(async () => {
  await app.close();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
});

const enc = encodeURIComponent;
const get = (path: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url: path, headers });
const target = (path: string) => enc(`${origin}${path}`);

describe('block pages are refused, not cached', () => {
  it('answers EBLOCKED after escalating HTTP → browser, and caches nothing', async () => {
    const first = await get(`/api/v1/meta?url=${target('/challenge')}`);
    expect(first.statusCode).toBe(502);
    expect(first.json()).toMatchObject({ status: 'error', code: 'EBLOCKED' });
    // HTTP pass + browser pass.
    expect(hits.get('/challenge')).toBe(2);
    const second = await get(`/api/v1/meta?url=${target('/challenge')}`);
    expect(second.statusCode).toBe(502);
    expect(hits.get('/challenge')).toBe(4);
  });

  it('answers EBLOCKED without a browser with render=never, and on /content and /extract', async () => {
    const never = await get(`/api/v1/meta?url=${target('/challenge')}&render=never`);
    expect(never.json().code).toBe('EBLOCKED');
    const content = await get(`/api/v1/content?url=${target('/challenge')}`);
    expect(content.json().code).toBe('EBLOCKED');
    const fields = enc(JSON.stringify({ t: { selector: 'title' } }));
    const extract = await get(`/api/v1/extract?url=${target('/challenge')}&render=never&fields=${fields}`);
    expect(extract.json().code).toBe('EBLOCKED');
    const status = await get(`/api/v1/content?url=${target('/challenge-403')}`);
    expect(status.json().code).toBe('EBLOCKED');
  });
});

describe('rendering robustness', () => {
  it('captures and reads a page whose load event never fires', async () => {
    const env = { BROWSER_NAVIGATION_TIMEOUT_MS: '2500' };
    const slow = await start(env);
    try {
      const shot = await slow.inject(`/api/v1/screenshot?url=${target('/hanging')}`);
      expect(shot.statusCode).toBe(200);
      expect(shot.headers['content-type']).toBe('image/png');
      const pdf = await slow.inject(`/api/v1/pdf?url=${target('/hanging')}`);
      expect(pdf.statusCode).toBe(200);
      const content = await slow.inject(`/api/v1/content?url=${target('/hanging')}&render=always`);
      expect(content.json().data.text).toContain('Rendered');
    } finally {
      await slow.close();
    }
  });

  it('answers ETIMEOUT as JSON when the request budget is exhausted', async () => {
    const tight = await start({ REQUEST_DEADLINE_MS: '5000', BROWSER_NAVIGATION_TIMEOUT_MS: '20000' });
    try {
      const startedAt = Date.now();
      const res = await tight.inject(`/api/v1/screenshot?url=${target('/never.js')}`);
      expect(res.statusCode).toBe(504);
      expect(res.json().code).toBe('ETIMEOUT');
      expect(Date.now() - startedAt).toBeLessThan(8000);
    } finally {
      await tight.close();
    }
  });

  it('waits for waitForSelector on every rendering endpoint', async () => {
    const content = await get(`/api/v1/content?url=${target('/late')}&waitForSelector=${enc('#late')}&mainContent=false`);
    expect(content.statusCode).toBe(200);
    expect(content.json().meta.source).toBe('browser');
    expect(content.json().data.text).toContain('ARRIVED');

    const fields = enc(JSON.stringify({ late: { selector: '#late' } }));
    const extract = await get(`/api/v1/extract?url=${target('/late')}&waitForSelector=${enc('#late')}&fields=${fields}`);
    expect(extract.json().data.fields.late).toBe('ARRIVED');

    expect((await get(`/api/v1/screenshot?url=${target('/late')}&waitForSelector=${enc('#late')}`)).statusCode).toBe(200);
    expect((await get(`/api/v1/pdf?url=${target('/late')}&waitForSelector=${enc('#late')}`)).statusCode).toBe(200);
  });

  it('validates waitForSelector like selector', async () => {
    for (const bad of ['xpath=//div', 'text=ARRIVED', 'a >> b']) {
      const res = await get(`/api/v1/screenshot?url=${target('/late')}&waitForSelector=${enc(bad)}`);
      expect(res.statusCode, bad).toBe(400);
      expect(res.json().code).toBe('EINVALIDPARAMS');
    }
    const never = await get(`/api/v1/content?url=${target('/late')}&waitForSelector=p&render=never`);
    expect(never.statusCode).toBe(400);
  });
});

const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe('screenshot quality', () => {
  it('loads lazy images before a full-page capture and hides consent banners by default', async () => {
    hits.delete('/red.svg');
    const viewportOnly = await get(`/api/v1/screenshot?url=${target('/lazy')}`);
    expect(viewportOnly.statusCode).toBe(200);
    expect(hits.get('/red.svg')).toBeUndefined();

    const full = await get(`/api/v1/screenshot?url=${target('/lazy')}&fullPage=true`);
    expect(full.statusCode).toBe(200);
    expect(pngSize(full.rawPayload).height).toBe(9600);
    expect(hits.get('/red.svg')).toBe(1);

    // The banner is a 1280×120 red block: with it, the PNG is measurably different.
    const withBanner = await get(`/api/v1/screenshot?url=${target('/lazy')}&hideBanners=false`);
    expect(withBanner.rawPayload.equals(viewportOnly.rawPayload)).toBe(false);
    const hiddenByHand = await get(`/api/v1/screenshot?url=${target('/lazy')}&hideBanners=false&hide=${enc('#cookie-banner')}`);
    expect(hiddenByHand.rawPayload.equals(viewportOnly.rawPayload)).toBe(true);
    expect(full.headers['x-render-source']).toBe('browser');
  });

  it('presents a coherent browser identity', async () => {
    const fields = enc(JSON.stringify({ ua: { selector: '#ua' }, wd: { selector: '#wd' } }));
    const probe = page('<title>Probe</title>', `<p id="ua"></p><p id="wd"></p><p>${SENTENCE.repeat(4)}</p>`);
    const seen: string[] = [];
    const hints: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.headers['user-agent'] ?? '');
      hints.push(String(req.headers['sec-ch-ua'] ?? ''));
      res.writeHead(200, { 'content-type': 'text/html' }).end(
        probe.replace('</body>', '<script>document.getElementById("ua").textContent = navigator.userAgent; document.getElementById("wd").textContent = String(navigator.webdriver);</script></body>'),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = enc(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
      const res = await get(`/api/v1/extract?url=${url}&render=always&fields=${fields}`);
      const { ua, wd } = res.json().data.fields;
      expect(ua).toMatch(/^Mozilla\/5\.0 \(X11; Linux x86_64\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/);
      expect(ua).not.toContain('Headless');
      expect(wd).toBe('false');
      expect(seen.at(-1)).toBe(ua);
      // Client hints tell the same story as the header.
      expect(hints.at(-1)).toContain('"Chromium";v="');
      expect(hints.at(-1)).not.toContain('Headless');
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('ad and tracker blocking (blockAds)', () => {
  it('matches hosts by registrable domain, not by substring', () => {
    expect(isAdOrTracker('https://securepubads.g.doubleclick.net/tag/js/gpt.js')).toBe(true);
    expect(isAdOrTracker('https://www.googletagmanager.com/gtm.js?id=X')).toBe(true);
    expect(isAdOrTracker('https://notdoubleclick.net/x.js')).toBe(false);
    expect(isAdOrTracker('https://example.com/doubleclick.net/x.js')).toBe(false);
    expect(isAdOrTracker('not a url')).toBe(false);
  });

  it('is off by default and accepted on screenshot and pdf', async () => {
    const shot = await get(`/api/v1/screenshot?url=${target('/article')}&blockAds=true`);
    expect(shot.statusCode).toBe(200);
    expect((await get(`/api/v1/pdf?url=${target('/article')}&blockAds=true`)).statusCode).toBe(200);
  });
});

describe('/content for agents', () => {
  it('returns links, images and truncated', async () => {
    const res = await get(`/api/v1/content?url=${target('/article')}`);
    expect(res.json().data).toMatchObject({
      truncated: false,
      links: [
        { url: `${origin}/next`, text: 'Next', internal: true },
        { url: 'https://elsewhere.test/x', text: 'Out', internal: false },
      ],
      images: [{ url: `${origin}/pic.png`, alt: 'Pic' }],
    });
  });

  it('returns the body directly with format=markdown|text', async () => {
    const markdown = await get(`/api/v1/content?url=${target('/article')}&format=markdown&citations=true`);
    expect(markdown.statusCode).toBe(200);
    expect(markdown.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(markdown.body.startsWith('# Agent article')).toBe(true);
    expect(markdown.body).toContain(`[1]: ${origin}/next`);
    expect(markdown.body).not.toContain('MENU');

    const text = await get(`/api/v1/content?url=${target('/article')}&format=text&mainContent=false`);
    expect(text.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(text.body).toContain('MENU');
    expect(text.headers['etag']).toBeDefined();
    const again = await get(`/api/v1/content?url=${target('/article')}&format=text&mainContent=false`, { 'if-none-match': String(text.headers['etag']) });
    expect(again.statusCode).toBe(304);
  });

  it('applies include / exclude and refuses invalid selectors', async () => {
    const res = await get(`/api/v1/content?url=${target('/article')}&include=${enc('nav, h1')}&exclude=${enc('h1')}&format=text`);
    expect(res.body).toBe('MENU');
    for (const bad of ['a{color:red}', 'p:nope(']) {
      const refused = await get(`/api/v1/content?url=${target('/article')}&exclude=${enc(bad)}`);
      expect(refused.statusCode, bad).toBe(400);
    }
  });
});

describe('HTTP contract', () => {
  it('ignores unknown query parameters (tracking, share tags)', async () => {
    const res = await get(`/api/v1/meta?url=${target('/article')}&utm_source=newsletter&fbclid=abc`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Agent article');
    // Known parameters are still validated.
    expect((await get(`/api/v1/meta?url=${target('/article')}&render=sometimes&utm_source=x`)).statusCode).toBe(400);
  });

  it('answers 304 to If-None-Match on JSON endpoints and exposes x-render-source', async () => {
    const first = await get(`/api/v1/meta?url=${target('/article')}`);
    const etag = String(first.headers['etag']);
    expect(etag).toMatch(/^"[\w-]{27}"$/);
    expect(first.headers['x-render-source']).toBe('http');

    const fresh = await get(`/api/v1/meta?url=${target('/article')}`, { 'if-none-match': etag });
    expect(fresh.statusCode).toBe(304);
    expect(fresh.body).toBe('');
    expect(fresh.headers['etag']).toBe(etag);
    expect(fresh.headers['cache-control']).toContain('max-age=');

    expect((await get(`/api/v1/meta?url=${target('/article')}`, { 'if-none-match': `W/${etag}, "other"` })).statusCode).toBe(304);
    expect((await get(`/api/v1/meta?url=${target('/article')}`, { 'if-none-match': '"stale"' })).statusCode).toBe(200);

    const fields = enc(JSON.stringify({ t: { selector: 'h1' } }));
    const extract = await get(`/api/v1/extract?url=${target('/article')}&fields=${fields}`);
    expect((await get(`/api/v1/extract?url=${target('/article')}&fields=${fields}`, { 'if-none-match': String(extract.headers['etag']) })).statusCode).toBe(304);
  });

  it('exposes rate-limit and cache headers through CORS', async () => {
    const res = await get(`/api/v1/meta?url=${target('/article')}`, { origin: 'https://app.example' });
    const exposed = String(res.headers['access-control-expose-headers']).toLowerCase();
    for (const header of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'etag', 'x-cache', 'x-render-source', 'x-request-id']) {
      expect(exposed, header).toContain(header);
    }
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
  });

  it('returns a direct image URL as image.url', async () => {
    const res = await get(`/api/v1/meta?url=${target('/photo.png')}`);
    expect(res.json().data).toMatchObject({
      contentType: 'image/png',
      title: 'photo.png',
      image: { url: `${origin}/photo.png`, type: 'image/png' },
      domain: '127.0.0.1',
    });
    const embed = await get(`/api/v1/meta?url=${target('/photo.png')}&embed=image.url`);
    expect(embed.statusCode).toBe(302);
  });
});

describe('POST /api/v1/meta/batch', () => {
  const batch = (body: unknown, instance: FastifyInstance = app) =>
    instance.inject({ method: 'POST', url: '/api/v1/meta/batch', payload: body as object });

  it('answers per item, in input order, and one failure never fails the batch', async () => {
    const urls = [
      `${origin}/article`,
      'http://169.254.169.254/latest/meta-data/',
      `${origin}/missing`,
      'not a url',
      `${origin}/challenge`,
      `${origin}/article`,
    ];
    const strict = await start({ SSRF_ALLOW_PRIVATE_NETWORKS: 'true', SSRF_BLOCKED_HOSTS: '169.254.169.254' });
    try {
      const res = await batch({ urls }, strict);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const { data, meta } = res.json();
      expect(data.map((item: { url: string }) => item.url)).toEqual(urls);
      expect(data.map((item: { status: string; code?: string }) => item.code ?? item.status)).toEqual([
        'success', 'EFORBIDDENURL', 'ETARGETSTATUS', 'EINVALIDURL', 'EBLOCKED', 'success',
      ]);
      expect(data[0].data.title).toBe('Agent article');
      expect(meta).toMatchObject({ succeeded: 2, failed: 4 });
    } finally {
      await strict.close();
    }
  });

  it('never uses the browser and applies the production SSRF policy to every URL', async () => {
    const production = await buildApp(loadConfig({ NODE_ENV: 'test', RATE_LIMIT_MAX: '1000' }));
    try {
      const res = await batch({ urls: [`${origin}/article`, 'http://localhost/', 'http://10.0.0.1/', 'ftp://x/'] }, production);
      expect(res.json().data.map((item: { code: string }) => item.code)).toEqual([
        'EFORBIDDENURL', 'EFORBIDDENURL', 'EFORBIDDENURL', 'EINVALIDURL',
      ]);
      const health = await production.inject('/health');
      expect(JSON.stringify(health.json())).toContain('"browserConnected":false');
    } finally {
      await production.close();
    }
  });

  it('validates the body and has its own, lower rate limit', async () => {
    expect((await batch({ urls: [] })).statusCode).toBe(400);
    expect((await batch({ urls: Array.from({ length: 11 }, (_, i) => `${origin}/a${i}`) })).statusCode).toBe(400);
    expect((await batch({})).json().code).toBe('EINVALIDPARAMS');

    const limited = await start({ RATE_LIMIT_MAX: '20' });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 3; i += 1) codes.push((await batch({ urls: [`${origin}/article`] }, limited)).statusCode);
      expect(codes).toEqual([200, 200, 429]);
      // The ordinary routes keep their own counter.
      expect((await limited.inject(`/api/v1/meta?url=${target('/article')}`)).statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  });
});
