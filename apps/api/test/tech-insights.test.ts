/**
 * `/tech` (static, bundles, rendered probe) and `/insights`, on the frozen
 * corpus of `test/corpus`: fixtures modelled on real build outputs.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/create-app.js';
import { detectTechnologies, pickBundles, sanitizeProbe } from '../src/services/tech-detector.js';
import { corpusFile, serveCorpus, type CorpusSite } from './helpers/corpus.js';

interface Tech { name: string; category: string; evidence: string; confidence: string; version: string | null }

const sites: Record<string, CorpusSite> = {};
let internal: Server;
let internalPort: number;
let app: FastifyInstance;

beforeAll(async () => {
  internal = createServer((_req, res) => res.end('SECRET'));
  await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve));
  internalPort = (internal.address() as AddressInfo).port;
  for (const name of ['vite-react', 'nextjs', 'wordpress', 'spa-shell']) sites[name] = await serveCorpus(name);
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
  for (const site of Object.values(sites)) await site.close();
  internal.closeAllConnections();
  await new Promise((resolve) => internal.close(resolve));
});

const enc = encodeURIComponent;
const get = (path: string) => app.inject({ method: 'GET', url: path });
const tech = async (site: string, query = '') => {
  const res = await get(`/api/v1/tech?url=${enc(`${sites[site]!.origin}/`)}${query}`);
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json();
  const byName = Object.fromEntries((body.data.technologies as Tech[]).map((t) => [t.name, t]));
  return { body, byName };
};
/** `name → [confidence, version]`, the part of a result that must not drift. */
const digest = (byName: Record<string, Tech>) =>
  Object.fromEntries(Object.values(byName).map((t) => [t.name, [t.confidence, t.version]]));

describe('GET /api/v1/tech on the corpus', () => {
  it('identifies a Vite + React + Tailwind single-page app from its bundles, without a browser', async () => {
    const { body, byName } = await tech('vite-react', '&render=never');
    expect(body.meta.source).toBe('http');
    expect(body.data.inspected).toEqual({ bundles: 3, rendered: false });
    expect(digest(byName)).toEqual({
      'React Router': ['high', '7.5.0'],
      React: ['high', '19.1.0'],
      'Tailwind CSS': ['high', '4.1.4'],
      Vite: ['high', null],
      Vercel: ['high', null],
    });
    expect(byName['React']!.evidence).toBe('bundle /assets/index-BqK3xT9a.js: version:"19.1.0",rendererPackageName:"react-dom"');
    expect(byName['Tailwind CSS']!.evidence).toBe('bundle /assets/index-DiwrgTda.css: tailwindcss v4.1.4');
    expect(byName['Vercel']!.evidence).toMatch(/^header x-vercel-id: /);
    // `auto` has its answer statically: no browser.
    expect((await tech('vite-react')).body.meta.source).toBe('http');
  });

  it('adds the rendered DOM and the built-in probe with render=always', async () => {
    const { body, byName } = await tech('vite-react', '&render=always');
    expect(body.meta.source).toBe('browser');
    expect(body.data.inspected.rendered).toBe(true);
    expect(byName['React']).toMatchObject({ confidence: 'high', version: '19.1.0' });
    expect(byName['React Router']).toMatchObject({ version: '7.5.0' });
    expect(byName['Tailwind CSS']).toMatchObject({ confidence: 'high', version: '4.1.4' });
  });

  it('identifies a Next.js app: framework, what it implies, bundler and CSS', async () => {
    const { byName } = await tech('nextjs', '&render=never');
    expect(digest(byName)).toEqual({
      'Next.js': ['high', null],
      React: ['high', null],
      'Tailwind CSS': ['high', '3.4.17'],
      webpack: ['high', null],
    });
    expect(byName['React']!.evidence).toBe('implied by Next.js');
    const rendered = await tech('nextjs', '&render=always');
    expect(rendered.byName['Next.js']).toMatchObject({ evidence: 'probe: next', version: '15.3.1' });
    expect(rendered.byName['Tailwind CSS']).toMatchObject({ confidence: 'high' });
  });

  it('identifies a WordPress + WooCommerce page with versions, and nothing it does not use', async () => {
    const { byName } = await tech('wordpress', '&render=never');
    expect(digest(byName)).toEqual({
      WordPress: ['high', '6.6.2'],
      WooCommerce: ['high', '9.3.3'],
      jQuery: ['high', null],
      'Google Tag Manager': ['high', null],
      nginx: ['high', '1.24.0'],
      PHP: ['high', '8.2.20'],
      Complianz: ['high', null],
    });
    // Bootstrap-like class names (`row p-3 d-flex btn`) are not Tailwind.
    expect(byName['Tailwind CSS']).toBeUndefined();
    expect(JSON.stringify(byName)).not.toContain('f3a9c1');
  });

  it('render=auto reaches for the browser only for a shell it cannot name', async () => {
    const never = await tech('spa-shell', '&render=never');
    expect(digest(never.byName)).toEqual({});
    const auto = await tech('spa-shell');
    expect(auto.body.meta.source).toBe('browser');
    expect(auto.byName['Vue.js']).toMatchObject({ evidence: 'probe: vue', confidence: 'high', version: '3.5.13' });
    expect(auto.byName['jQuery']).toMatchObject({ version: '3.7.1' });
    // A hostile getter is skipped; a non-version string never becomes a version.
    expect(auto.byName['Shopify']).toBeUndefined();
    expect(auto.byName['Stripe']).toMatchObject({ version: null });
    expect(JSON.stringify(auto.body)).not.toContain('onerror');
  });

  it('validates parameters and keeps the SSRF guarantees', async () => {
    expect((await get(`/api/v1/tech?url=${enc(sites['nextjs']!.origin)}&render=sometimes`)).statusCode).toBe(400);
    expect((await get(`/api/v1/tech?url=${enc(`http://127.0.0.1:${internalPort}/`)}`)).json().code).toBe('EFORBIDDENURL');
    expect((await get(`/api/v1/tech?url=${enc(`http://127.0.0.1:${internalPort}/`)}&render=always`)).json().code).toBe('EFORBIDDENURL');
    expect((await get(`/api/v1/tech?url=${enc(`${sites['nextjs']!.origin}/missing`)}`)).json().code).toBe('ETARGETSTATUS');
    expect((await get(`/api/v1/tech?url=${enc(`${sites['vite-react']!.origin}/assets/index-DiwrgTda.css`)}`)).json().code).toBe('ENOTHTML');
  });
});

describe('technology detection (pure)', () => {
  it('prefers missing a technology to asserting one', () => {
    expect(detectTechnologies('<html><body><p>We love WordPress, React and Shopify.</p></body></html>', {})).toEqual([]);
    expect(detectTechnologies('<div class="container row col-md-6 btn btn-primary text-center p-3 mt-4 d-flex"></div>', {})).toEqual([]);
    expect(detectTechnologies('<script src="/js/react-router.js"></script><script src="/vuetiful.js"></script>', {})).toEqual([]);
    expect(detectTechnologies('', { server: 'cloudflare' }).map((t) => t.name)).toEqual(['Cloudflare']);
  });

  it('reads versions only where the evidence states one', () => {
    const found = detectTechnologies(
      '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>' +
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>' +
        '<script src="/static/vue.global.prod.js"></script><style data-styled="active" data-styled-version="6.1.13"></style>' +
        '<app-root ng-version="18.2.4"></app-root>',
      { server: 'Apache/2.4.62 (Debian)', 'x-powered-by': 'Express' },
    );
    const byName = Object.fromEntries(found.map((t) => [t.name, t]));
    expect(byName['Bootstrap']).toMatchObject({ version: '5.3.3', confidence: 'high' });
    expect(byName['jQuery']).toMatchObject({ version: '3.7.1' });
    expect(byName['Vue.js']).toMatchObject({ version: null });
    expect(byName['styled-components']).toMatchObject({ version: '6.1.13' });
    expect(byName['Angular']).toMatchObject({ version: '18.2.4' });
    expect(byName['Apache']).toMatchObject({ version: '2.4.62', category: 'server' });
    expect(byName['Express']).toMatchObject({ category: 'framework' });
    expect(byName['jsDelivr']).toBeDefined();
  });

  it('reports Tailwind from markup only when variants and palette colours are both there', () => {
    const html = corpusFile('nextjs/index.html');
    const fromMarkup = detectTechnologies(html, {}).find((t) => t.name === 'Tailwind CSS');
    expect(fromMarkup).toMatchObject({ confidence: 'medium', version: null });
    expect(fromMarkup!.evidence).toMatch(/^markup: \d+ distinct utility classes/);
  });

  it('picks first-party bundles only, entry points first, and sanitises the probe', () => {
    const picked = pickBundles(
      '<script src="https://cdn.other.net/x.js"></script><script src="/a.js"></script><script type="module" src="/main.js"></script>' +
        '<link rel="stylesheet" href="/s.css"><link rel="modulepreload" href="/chunk.js"><script src="/b.js"></script><script src="/c.js"></script>',
      'https://example.com/',
      3,
    );
    expect(picked).toEqual(['https://example.com/main.js', 'https://example.com/s.css', 'https://example.com/a.js']);
    expect(sanitizeProbe({ react: '19.1.0', vue: true, jquery: '<b>', unknown: '1.0', next: 7 })).toEqual({ react: '19.1.0', vue: true, jquery: true });
    expect(sanitizeProbe('nope')).toEqual({});
  });
});

describe('GET /api/v1/insights', () => {
  it('measures one load and labels it as a lab measurement', async () => {
    const res = await get(`/api/v1/insights?url=${enc(`${sites['vite-react']!.origin}/`)}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['x-render-source']).toBe('browser');
    const { data, meta } = res.json();
    expect(meta.source).toBe('browser');
    expect(data).toMatchObject({ url: `${sites['vite-react']!.origin}/`, device: 'desktop', measurement: 'lab', status: 200, loaded: true });
    expect(data.timings.ttfbMs).toBeGreaterThan(0);
    expect(data.timings.domContentLoadedMs).toBeGreaterThanOrEqual(data.timings.ttfbMs);
    expect(data.timings.loadMs).toBeGreaterThanOrEqual(data.timings.domContentLoadedMs);
    expect(data.network.byType.document.requests).toBe(1);
    expect(data.network.byType.script.requests).toBeGreaterThanOrEqual(1);
    expect(data.network.byType.stylesheet.requests).toBe(1);
    expect(data.network.transferBytes).toBeGreaterThan(3000);
    expect(data.network.requests).toBe(
      Object.values(data.network.byType as Record<string, { requests: number }>).reduce((sum, t) => sum + t.requests, 0),
    );
    expect(data.network.thirdParty).toEqual({ hostCount: 0, hosts: [], requests: 0, transferBytes: 0 });
    expect(data.network.limitReached).toBeNull();
    expect(data.dom.elements).toBeGreaterThan(10);
    expect(data.vitals.cls).toBeGreaterThanOrEqual(0);
    expect(data.vitals.fcpMs).toBeGreaterThan(0);
    expect(data.vitals.lcpMs).toBeGreaterThan(0);
    expect(data.technologies.map((t: Tech) => t.name)).toEqual(expect.arrayContaining(['React', 'Vercel']));
    expect(Date.parse(data.measuredAt)).not.toBeNaN();

    const again = await get(`/api/v1/insights?url=${enc(`${sites['vite-react']!.origin}/`)}`);
    expect(again.headers['x-cache']).toBe('HIT');
    expect(again.json().data.measuredAt).toBe(data.measuredAt);
  });

  it('fails cleanly: bad parameters, missing page, non-HTML, forbidden destination', async () => {
    const origin = sites['vite-react']!.origin;
    expect((await get(`/api/v1/insights?url=${enc(origin)}&device=watch`)).statusCode).toBe(400);
    expect((await get('/api/v1/insights')).statusCode).toBe(400);
    expect((await get(`/api/v1/insights?url=${enc(`${origin}/nope`)}`)).json().code).toBe('ETARGETSTATUS');
    expect((await get(`/api/v1/insights?url=${enc(`${origin}/assets/index-DiwrgTda.css`)}`)).json().code).toBe('ENOTHTML');
    expect((await get(`/api/v1/insights?url=${enc(`http://127.0.0.1:${internalPort}/`)}`)).json()).toMatchObject({ code: 'EFORBIDDENURL' });
  });
});
