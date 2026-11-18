/**
 * `<QrCode>` and `<OgImage>` on the server: plain Node, no DOM. They are
 * `<img>` elements whose `src` is exactly what the SDK's URL builders return.
 */
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createClient } from '@omnillink/sdk';

import { OgImage, ogImageUrl, OmnillinkProvider, QrCode, qrCodeUrl } from '../src/index.js';

const BASE = 'https://links.example.com';
const sdk = createClient({ baseUrl: BASE });
const srcOf = (html: string): string => (/ src="([^"]*)"/.exec(html)?.[1] ?? '').replaceAll('&amp;', '&');

describe('<QrCode>', () => {
  it('is an <img> over qrUrl(), sized after `size`', () => {
    const html = renderToStaticMarkup(createElement(QrCode, { url: 'https://example.com/a?b=1', baseUrl: BASE, size: 256, ecc: 'H', margin: 2, color: '112233', background: '00000000' }));
    // React 19 adds a preload hint in front of an eager image; the element itself is a bare <img>.
    expect(html).toMatch(/<img decoding="async" src="[^"]+" alt="[^"]+" width="256" height="256"\/>$/);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(srcOf(html)).toBe(sdk.qrUrl('https://example.com/a?b=1', { size: 256, margin: 2, ecc: 'H', color: '112233', background: '00000000' }));
    expect(html).toContain('width="256"');
    expect(html).toContain('height="256"');
    expect(html).toContain('alt="QR code of https://example.com/a?b=1"');
    expect(html).toContain('decoding="async"');
  });

  it('passes <img> attributes through and takes the instance from the provider', () => {
    const html = renderToStaticMarkup(
      createElement(OmnillinkProvider, { baseUrl: BASE }, createElement(QrCode, { url: 'https://example.com/', format: 'png', alt: 'Scan me', className: 'qr', loading: 'lazy', width: 120, height: 120, id: 'code' })),
    );
    expect(srcOf(html)).toBe(`${BASE}/api/v1/qr?url=https%3A%2F%2Fexample.com%2F&format=png`);
    expect(html).toContain('alt="Scan me"');
    expect(html).toContain('class="qr"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="120"');
    expect(html).toContain('id="code"');
  });

  it('defaults to the origin of the page and to 512 pixels', () => {
    const html = renderToStaticMarkup(createElement(QrCode, { url: 'https://example.com/' }));
    expect(srcOf(html)).toBe('/api/v1/qr?url=https%3A%2F%2Fexample.com%2F');
    expect(html).toContain('width="512"');
  });

  it('renders nothing for what is not an http(s) URL', () => {
    for (const url of ['', 'javascript:alert(1)', 'example.com', 'https://user:pass@example.com/']) {
      expect(renderToStaticMarkup(createElement(QrCode, { url, baseUrl: BASE }))).toBe('');
    }
  });

  it('forwards its ref to the <img>', () => {
    const ref = createRef<HTMLImageElement>();
    expect(() => renderToStaticMarkup(createElement(QrCode, { url: 'https://example.com/', ref }))).not.toThrow();
  });
});

describe('<OgImage>', () => {
  it('is a 1200×630 <img> over ogUrl(), with the title as its alternative text', () => {
    const params = { title: 'Tide tables <explained> & more', description: 'Eleven minutes early.', site: 'Estuary Gazette', author: 'A. Okafor', label: 'Guide', template: 'gradient', theme: 'dark', accent: 'ff0066', format: 'jpeg', ttl: 86400 } as const;
    const html = renderToStaticMarkup(createElement(OgImage, { ...params, baseUrl: BASE }));
    expect(srcOf(html)).toBe(sdk.ogUrl(params));
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="630"');
    expect(html).toContain('alt="Tide tables &lt;explained&gt; &amp; more"');
    // The title is a parameter of the image, never the tooltip of the element.
    expect(html).not.toContain(' title=');
  });

  it('passes <img> attributes through', () => {
    const html = renderToStaticMarkup(createElement(OgImage, { title: 'Hello', baseUrl: BASE, alt: '', className: 'card', width: 600, height: 315, loading: 'lazy' }));
    expect(html).toContain('alt=""');
    expect(html).toContain('class="card"');
    expect(html).toContain('width="600"');
  });

  it('renders nothing without a title', () => {
    expect(renderToStaticMarkup(createElement(OgImage, { title: '   ', baseUrl: BASE }))).toBe('');
  });
});

describe('URL helpers', () => {
  it('ogImageUrl() and qrCodeUrl() are the SDK builders, callable on the server', () => {
    expect(ogImageUrl(BASE, { title: 'Mon article', site: 'Mon site' })).toBe(`${BASE}/api/v1/og?title=Mon+article&site=Mon+site`);
    expect(qrCodeUrl(BASE, 'https://example.com/', { size: 300 })).toBe(`${BASE}/api/v1/qr?url=https%3A%2F%2Fexample.com%2F&size=300`);
  });
});
