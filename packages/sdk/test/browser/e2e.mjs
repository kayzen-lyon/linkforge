/**
 * Loads the built `<link-preview>` in a real Chromium against a stubbed API.
 *
 *   npm run build && npm run test:browser
 *
 * Needs `playwright-core` (or `playwright`) to be resolvable and a Chromium
 * installed for it. Screenshots go to $OMNILLINK_SHOTS_DIR (default: OS tmp dir).
 */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(here, '../../dist');
const shotsDir = process.env.OMNILLINK_SHOTS_DIR ?? join(tmpdir(), 'omnillink-sdk-shots');

function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return require(name);
    } catch {
      /* try the next one */
    }
  }
  throw new Error('playwright-core is not resolvable; run with NODE_PATH pointing to a global install');
}

// ---- stub server ---------------------------------------------------------

const OG_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f6c66b"/><stop offset="1" stop-color="#d9534f"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<circle cx="930" cy="170" r="210" fill="#fff" fill-opacity=".18"/>
<path d="M0 630 420 300l260 190 200-130 320 270z" fill="#3b2a4a" fill-opacity=".55"/></svg>`;
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="8" fill="#d9534f"/><circle cx="16" cy="16" r="7" fill="#fff"/></svg>`;

const TYPES = { '.js': 'text/javascript', '.map': 'application/json', '.html': 'text/html' };

/** Every /meta call: { target, aborted }. */
const metaCalls = [];

function metaFor(target, origin) {
  const base = {
    url: target,
    canonicalUrl: null,
    author: null,
    lang: 'en',
    date: null,
    images: [],
    video: null,
    audio: null,
    keywords: [],
    feeds: [],
    jsonLd: [],
    contentType: 'text/html',
  };
  const host = new URL(target).hostname;
  if (host === 'hostile.test') {
    return {
      ...base,
      title: '<img src=x onerror="window.__pwned=\'title\'">Hostile <b>title</b>',
      description: '<script>window.__pwned="description"</script><svg onload="window.__pwned=\'svg\'">',
      publisher: '"><img src=x onerror="window.__pwned=\'publisher\'">',
      lang: 'en"><script>window.__pwned="lang"</script>',
      image: { url: 'javascript:window.__pwned="image"', width: null, height: null, type: null, alt: null },
      images: [{ url: 'JaVaScRiPt:window.__pwned="images"' }, { url: 'data:text/html,<script>parent.__pwned=1</script>' }],
      favicon: ' javascript:window.__pwned="favicon"',
      logo: { url: 'java\nscript:window.__pwned="logo"' },
    };
  }
  if (host === 'noimage.test') {
    return {
      ...base,
      title: 'A page that declares no preview image at all',
      description: 'The card falls back to a monogram tile drawn from the site name.',
      publisher: 'Quiet Notes',
      image: null,
      favicon: null,
      logo: null,
    };
  }
  if (host === 'brokenimage.test') {
    return {
      ...base,
      title: 'Image that fails to load',
      description: null,
      publisher: null,
      image: { url: `${origin}/missing.png`, width: null, height: null, type: null, alt: null },
      favicon: `${origin}/missing.ico`,
      logo: null,
    };
  }
  return {
    ...base,
    url: target,
    title:
      host === 'second.test'
        ? 'Second article, loaded after an attribute change'
        : 'Field notes on building a link preview that stays out of the way',
    description:
      'How we fetch metadata once, cache it at the edge and render a card that is still a plain, honest link underneath. With measurements.',
    publisher: 'Harbor Journal',
    image: { url: `${origin}/og.svg`, width: 1200, height: 630, type: 'image/svg+xml', alt: null },
    favicon: `${origin}/favicon.svg`,
    logo: null,
  };
}

const server = createServer(async (req, res) => {
  const origin = `http://${req.headers.host}`;
  const url = new URL(req.url, origin);
  const send = (status, type, body) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };

  if (url.pathname === '/api/v1/meta') {
    const target = url.searchParams.get('url') ?? '';
    const call = { target, aborted: false };
    metaCalls.push(call);
    res.on('close', () => {
      if (!res.writableEnded) call.aborted = true;
    });
    const host = new URL(target).hostname;
    if (host === 'error.test' || host === 'error2.test') {
      return send(502, 'application/json', JSON.stringify({ status: 'error', code: 'EUNREACHABLE', message: 'Site unreachable' }));
    }
    if (host === 'slow.test') return; // never answers: only an abort ends it
    const delay = host === 'skeleton.test' ? 60_000 : 0;
    if (delay > 0) return;
    return send(
      200,
      'application/json',
      JSON.stringify({ status: 'success', data: metaFor(target, origin), meta: { cached: false, source: 'http', durationMs: 3 } }),
    );
  }
  if (url.pathname === '/og.svg') return send(200, 'image/svg+xml', OG_IMAGE);
  if (url.pathname === '/favicon.svg') return send(200, 'image/svg+xml', FAVICON);
  if (url.pathname === '/' || url.pathname === '/blank') {
    return send(
      200,
      'text/html',
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>link-preview e2e</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;padding:32px;font-family:system-ui,sans-serif;background:Canvas;color:CanvasText}
:root{color-scheme:light dark}#stage{display:grid;gap:24px;max-width:560px}</style>
<script type="module" src="/dist/element.js"></script></head><body><div id="stage"></div></body></html>`,
    );
  }
  if (url.pathname.startsWith('/dist/')) {
    const file = normalize(join(distDir, url.pathname.slice('/dist/'.length)));
    if (!file.startsWith(distDir)) return send(403, 'text/plain', 'forbidden');
    try {
      return send(200, TYPES[extname(file)] ?? 'application/octet-stream', await readFile(file));
    } catch {
      return send(404, 'text/plain', 'not found');
    }
  }
  return send(404, 'text/plain', 'not found');
});

// ---- helpers ---------------------------------------------------------------

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`  ok   ${name}`);
  } catch (error) {
    results.push([false, name]);
    console.log(`  FAIL ${name}\n       ${String(error?.message ?? error).split('\n').join('\n       ')}`);
  }
}

/** Replaces the stage content with elements described as attribute maps (+ optional `html` light DOM). */
async function mount(page, specs) {
  await page.evaluate((list) => {
    const stage = document.getElementById('stage');
    stage.replaceChildren();
    for (const { light, style, ...attrs } of list) {
      const node = document.createElement('link-preview');
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      if (style) node.style.cssText = style;
      if (light) {
        const a = document.createElement('a');
        a.href = light;
        a.textContent = 'Author-provided link';
        node.append(a);
      }
      stage.append(node);
    }
  }, specs);
}

const waitState = (page, index, state) =>
  page.waitForFunction(
    ([i, s]) => document.querySelectorAll('link-preview')[i]?.getAttribute('state') === s,
    [index, state],
    { timeout: 5000 },
  );

/** Snapshot of the shadow DOM of the nth element. */
const inspect = (page, index = 0) =>
  page.evaluate((i) => {
    const host = document.querySelectorAll('link-preview')[i];
    const root = host.shadowRoot;
    const text = (selector) => root.querySelector(selector)?.textContent ?? null;
    return {
      state: host.getAttribute('state'),
      cardHref: root.querySelector('a.card')?.getAttribute('href') ?? null,
      cardRel: root.querySelector('a.card')?.getAttribute('rel') ?? null,
      title: text('.title'),
      description: text('.description'),
      publisher: text('.publisher'),
      host: text('.host'),
      bodyLang: root.querySelector('.body')?.getAttribute('lang') ?? null,
      image: root.querySelector('.media img')?.getAttribute('src') ?? null,
      icon: root.querySelector('img.icon')?.getAttribute('src') ?? null,
      noImage: root.querySelector('a.card')?.classList.contains('no-image') ?? null,
      plainHref: root.querySelector('a.plain')?.getAttribute('href') ?? null,
      plainText: text('a.plain'),
      hasSlot: root.querySelector('slot') !== null,
      skeleton: root.querySelector('a.card.skeleton') !== null,
      busy: root.querySelector('a.card')?.getAttribute('aria-busy') ?? null,
      elementCount: root.querySelectorAll('*').length,
      tags: [...new Set([...root.querySelectorAll('*')].map((n) => n.localName))].sort(),
      urlAttributes: [...root.querySelectorAll('[src],[href]')].map((n) => n.getAttribute('src') ?? n.getAttribute('href')),
      handlerAttributes: [...root.querySelectorAll('*')].flatMap((n) =>
        n.getAttributeNames().filter((name) => name.startsWith('on')),
      ),
    };
  }, index);

// ---- run -------------------------------------------------------------------

await mkdir(shotsDir, { recursive: true });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = loadPlaywright();
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const dialogs = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  // Any navigation or request with a script-capable scheme would be a failure too.
  const requested = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto(`${origin}/`);
  await page.waitForFunction(() => customElements.get('link-preview') !== undefined);

  console.log('\nrendering');
  await check('renders a card from /meta (native multi-file ESM, no bundler)', async () => {
    await mount(page, [{ url: 'https://ok.test/article', 'base-url': origin }]);
    await waitState(page, 0, 'ready');
    const dom = await inspect(page);
    assert.equal(dom.cardHref, 'https://ok.test/article');
    assert.equal(dom.cardRel, 'noopener noreferrer');
    assert.equal(dom.title, 'Field notes on building a link preview that stays out of the way');
    assert.match(dom.description, /^How we fetch metadata once/);
    assert.equal(dom.publisher, 'Harbor Journal');
    assert.equal(dom.host, 'ok.test');
    assert.equal(dom.bodyLang, 'en');
    assert.equal(dom.image, `${origin}/og.svg`);
    assert.equal(dom.icon, `${origin}/favicon.svg`);
    assert.equal(dom.noImage, false);
    const loaded = await page.evaluate(() => {
      const img = document.querySelector('link-preview').shadowRoot.querySelector('.media img');
      return img.decode().then(() => img.naturalWidth > 0);
    });
    assert.equal(loaded, true);
  });

  await check('base-url defaults to the origin of the page', async () => {
    await mount(page, [{ url: 'https://ok.test/same-origin', loading: 'eager' }]);
    await waitState(page, 0, 'ready');
    assert.equal(metaCalls.at(-1).target, 'https://ok.test/same-origin');
  });

  await check('dispatches link-preview:load with the data', async () => {
    const detail = await page.evaluate(
      (base) =>
        new Promise((done) => {
          const node = document.createElement('link-preview');
          node.addEventListener('link-preview:load', (event) => done(event.detail.data.publisher));
          node.setAttribute('base-url', base);
          node.url = 'https://ok.test/event';
          document.getElementById('stage').replaceChildren(node);
        }),
      origin,
    );
    assert.equal(detail, 'Harbor Journal');
  });

  await check('shows a skeleton that is already a link while loading', async () => {
    await mount(page, [{ url: 'https://skeleton.test/', 'base-url': origin }]);
    await waitState(page, 0, 'loading');
    const dom = await inspect(page);
    assert.equal(dom.skeleton, true);
    assert.equal(dom.busy, 'true');
    assert.equal(dom.cardHref, 'https://skeleton.test/');
    const animation = await page.evaluate(
      () => getComputedStyle(document.querySelector('link-preview').shadowRoot.querySelector('.bone')).animationName,
    );
    assert.equal(animation, 'lp-sweep');
  });

  await check('respects prefers-reduced-motion', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const styles = await page.evaluate(() => {
      const root = document.querySelector('link-preview').shadowRoot;
      return {
        bone: getComputedStyle(root.querySelector('.bone')).animationName,
        card: getComputedStyle(root.querySelector('.card')).transitionDuration,
      };
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(styles.bone, 'none');
    assert.equal(styles.card, '0s');
  });

  console.log('\nfallbacks');
  await check('falls back to a plain link when the API fails', async () => {
    await mount(page, [{ url: 'https://error.test/page', 'base-url': origin }]);
    const error = page.evaluate(
      () =>
        new Promise((done) =>
          document.addEventListener('link-preview:error', (event) => done(event.detail.error.code), { once: true }),
        ),
    );
    await waitState(page, 0, 'error');
    const dom = await inspect(page);
    assert.equal(dom.plainHref, 'https://error.test/page');
    assert.equal(dom.plainText, 'https://error.test/page');
    assert.equal(dom.cardHref, null);
    assert.equal(await error, 'EUNREACHABLE');
  });

  await check('falls back to the light DOM when the author provided some', async () => {
    await mount(page, [{ url: 'https://error2.test/page', 'base-url': origin, light: 'https://error2.test/page' }]);
    await waitState(page, 0, 'error');
    const dom = await inspect(page);
    assert.equal(dom.hasSlot, true);
    assert.equal(dom.plainHref, null);
    assert.equal(await page.locator('link-preview a').isVisible(), true);
  });

  await check('falls back when the API is unreachable (network error)', async () => {
    await mount(page, [{ url: 'https://ok.test/x', 'base-url': 'http://127.0.0.1:9' }]);
    await waitState(page, 0, 'error');
    assert.equal((await inspect(page)).plainHref, 'https://ok.test/x');
  });

  await check('renders nothing clickable for a non-http(s) url attribute', async () => {
    const before = metaCalls.length;
    await mount(page, [
      { url: 'javascript:window.__pwned="attr"', 'base-url': origin },
      { url: 'not a url', 'base-url': origin },
      { 'base-url': origin },
    ]);
    await waitState(page, 2, 'idle');
    for (const index of [0, 1, 2]) {
      const dom = await inspect(page, index);
      assert.equal(dom.state, 'idle');
      assert.deepEqual(dom.urlAttributes, []);
    }
    assert.equal(metaCalls.length, before);
  });

  await check('drops an image that fails to load and shows the monogram', async () => {
    await mount(page, [{ url: 'https://brokenimage.test/', 'base-url': origin }]);
    await waitState(page, 0, 'ready');
    await page.waitForFunction(
      () => document.querySelector('link-preview').shadowRoot.querySelectorAll('img').length === 0,
    );
    const dom = await inspect(page);
    assert.equal(dom.noImage, true);
    assert.equal(dom.title, 'Image that fails to load');
  });

  console.log('\nhostile metadata');
  await check('a hostile payload executes nothing and stays text', async () => {
    await mount(page, [
      { url: 'https://hostile.test/', 'base-url': origin },
      { url: 'https://hostile.test/large', 'base-url': origin, size: 'large' },
    ]);
    await waitState(page, 0, 'ready');
    await waitState(page, 1, 'ready');
    await page.waitForTimeout(400); // time for any injected resource or handler to fire

    for (const index of [0, 1]) {
      const dom = await inspect(page, index);
      assert.equal(dom.title, '<img src=x onerror="window.__pwned=\'title\'">Hostile <b>title</b>');
      assert.match(dom.description, /^<script>window\.__pwned/);
      assert.equal(dom.publisher, '"><img src=x onerror="window.__pwned=\'publisher\'">');
      assert.equal(dom.bodyLang, null);
      // No element was created from the payload: only the card's own skeleton of tags.
      assert.deepEqual(dom.tags, ['a', 'path', 'span', 'svg']);
      assert.deepEqual(dom.handlerAttributes, []);
      assert.deepEqual(dom.urlAttributes, [index === 0 ? 'https://hostile.test/' : 'https://hostile.test/large']);
      assert.equal(dom.noImage, true);
    }
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.deepEqual(dialogs, []);
    assert.deepEqual(requested.filter((url) => /^(javascript|data|vbscript):/i.test(url)), []);
    assert.equal(requested.some((url) => new URL(url).pathname === '/x'), false);
  });

  console.log('\nupdates');
  await check('re-renders when the url attribute changes', async () => {
    await mount(page, [{ url: 'https://ok.test/first', 'base-url': origin }]);
    await waitState(page, 0, 'ready');
    await page.evaluate(() => document.querySelector('link-preview').setAttribute('url', 'https://second.test/b'));
    await page.waitForFunction(
      () => document.querySelector('link-preview').shadowRoot.querySelector('.host')?.textContent === 'second.test',
    );
    const dom = await inspect(page);
    assert.equal(dom.cardHref, 'https://second.test/b');
    assert.equal(dom.title, 'Second article, loaded after an attribute change');
  });

  await check('aborts the stale request when the url changes mid-flight', async () => {
    await mount(page, [{ url: 'https://slow.test/never', 'base-url': origin }]);
    await waitState(page, 0, 'loading');
    const slow = metaCalls.at(-1);
    assert.equal(slow.target, 'https://slow.test/never');
    await page.evaluate(() => (document.querySelector('link-preview').url = 'https://ok.test/after-slow'));
    await waitState(page, 0, 'ready');
    assert.equal((await inspect(page)).cardHref, 'https://ok.test/after-slow');
    await page.waitForTimeout(100);
    assert.equal(slow.aborted, true);
  });

  await check('aborts the request when the element is removed', async () => {
    await mount(page, [{ url: 'https://slow.test/removed', 'base-url': origin }]);
    await waitState(page, 0, 'loading');
    const slow = metaCalls.at(-1);
    await page.evaluate(() => document.getElementById('stage').replaceChildren());
    await page.waitForTimeout(100);
    assert.equal(slow.aborted, true);
  });

  await check('coalesces a burst of attribute changes into one request', async () => {
    const before = metaCalls.length;
    await page.evaluate((base) => {
      const node = document.createElement('link-preview');
      node.setAttribute('loading', 'eager');
      document.getElementById('stage').replaceChildren(node);
      node.setAttribute('url', 'https://ok.test/1');
      node.setAttribute('url', 'https://ok.test/2');
      node.setAttribute('base-url', base);
      node.setAttribute('url', 'https://ok.test/3');
    }, origin);
    await waitState(page, 0, 'ready');
    assert.deepEqual(metaCalls.slice(before).map((call) => call.target), ['https://ok.test/3']);
  });

  await check('size and theme apply without a new request', async () => {
    await mount(page, [{ url: 'https://ok.test/layout', 'base-url': origin }]);
    await waitState(page, 0, 'ready');
    const before = metaCalls.length;
    const measure = () =>
      page.evaluate(() => {
        const root = document.querySelector('link-preview').shadowRoot;
        const media = root.querySelector('.media').getBoundingClientRect();
        const body = root.querySelector('.body').getBoundingClientRect();
        return { stacked: body.top >= media.bottom - 1, background: getComputedStyle(root.querySelector('.card')).backgroundColor };
      });
    const compact = await measure();
    await page.evaluate(() => {
      const node = document.querySelector('link-preview');
      node.size = 'large';
      node.theme = 'dark';
    });
    const large = await measure();
    assert.equal(compact.stacked, false);
    assert.equal(large.stacked, true);
    assert.notEqual(compact.background, large.background);
    assert.equal(metaCalls.length, before);
  });

  await check('CSS custom properties restyle the card', async () => {
    await mount(page, [
      { url: 'https://ok.test/themed', 'base-url': origin, style: '--omnillink-bg: rgb(1, 2, 3); --omnillink-radius: 0px; --omnillink-fg: rgb(250, 250, 250)' },
    ]);
    await waitState(page, 0, 'ready');
    const style = await page.evaluate(() => {
      const card = getComputedStyle(document.querySelector('link-preview').shadowRoot.querySelector('.card'));
      return [card.backgroundColor, card.borderTopLeftRadius, card.color];
    });
    assert.deepEqual(style, ['rgb(1, 2, 3)', '0px', 'rgb(250, 250, 250)']);
  });

  console.log('\nlazy loading');
  await check('waits until the card nears the viewport', async () => {
    await mount(page, []);
    const before = metaCalls.length;
    await page.evaluate((base) => {
      const spacer = document.createElement('div');
      spacer.style.height = '4000px';
      const node = document.createElement('link-preview');
      node.setAttribute('url', 'https://ok.test/lazy');
      node.setAttribute('base-url', base);
      document.getElementById('stage').append(spacer, node);
    }, origin);
    await page.waitForTimeout(300);
    assert.equal(metaCalls.length, before, 'no request while far below the fold');
    assert.equal((await inspect(page)).state, 'idle');
    assert.equal((await inspect(page)).skeleton, true);
    await page.evaluate(() => document.querySelector('link-preview').scrollIntoView());
    await waitState(page, 0, 'ready');
    assert.equal(metaCalls.length, before + 1);
  });

  await check('loading="eager" skips the wait', async () => {
    await mount(page, []);
    const before = metaCalls.length;
    await page.evaluate((base) => {
      const spacer = document.createElement('div');
      spacer.style.height = '4000px';
      const node = document.createElement('link-preview');
      node.setAttribute('url', 'https://ok.test/eager');
      node.setAttribute('base-url', base);
      node.setAttribute('loading', 'eager');
      document.getElementById('stage').append(spacer, node);
    }, origin);
    await waitState(page, 0, 'ready');
    assert.equal(metaCalls.length, before + 1);
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  console.log('\naccessibility');
  await check('the card is one link named by its content, images are decorative', async () => {
    await mount(page, [{ url: 'https://ok.test/a11y', 'base-url': origin }]);
    await waitState(page, 0, 'ready');
    const link = page.getByRole('link', { name: /Field notes on building a link preview/ });
    assert.equal(await link.count(), 1);
    assert.equal(await page.getByRole('img').count(), 0);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const root = document.querySelector('link-preview').shadowRoot;
      const card = root.querySelector('a.card');
      return root.activeElement === card && getComputedStyle(card).outlineStyle !== 'none';
    });
    assert.equal(focused, true);
  });

  // ---- screenshots ------------------------------------------------------
  const gallery = [
    { url: 'https://ok.test/article', 'base-url': origin, loading: 'eager' },
    { url: 'https://noimage.test/', 'base-url': origin, loading: 'eager' },
    { url: 'https://ok.test/large', 'base-url': origin, size: 'large', loading: 'eager' },
    { url: 'https://skeleton.test/', 'base-url': origin, loading: 'eager' },
    { url: 'https://error.test/some/unreachable/page', 'base-url': origin, loading: 'eager' },
    { url: 'https://hostile.test/', 'base-url': origin, loading: 'eager' },
    { url: 'https://ok.test/narrow', 'base-url': origin, loading: 'eager', style: 'max-width: 320px' },
  ];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await mount(page, gallery);
    for (const [index, state] of ['ready', 'ready', 'ready', 'loading', 'error', 'ready', 'ready'].entries()) {
      await waitState(page, index, state);
    }
    // Not `networkidle`: the skeleton card keeps a request pending on purpose.
    await page.evaluate(() =>
      Promise.all(
        [...document.querySelectorAll('link-preview')].flatMap((host) =>
          [...host.shadowRoot.querySelectorAll('img')].map((img) => img.decode().catch(() => {})),
        ),
      ),
    );
    await page.waitForTimeout(150);
    const file = join(shotsDir, `link-preview-${scheme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`\nscreenshot: ${file}`);
  }

  await check('no uncaught page error during the whole run', async () => {
    assert.deepEqual(pageErrors, []);
    // The only console errors allowed are the failed fetches / images the stubs provoke on purpose.
    const unexpected = consoleErrors.filter((text) => !/Failed to load resource|ERR_/.test(text));
    assert.deepEqual(unexpected, []);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
  });
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
