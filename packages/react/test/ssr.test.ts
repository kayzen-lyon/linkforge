/**
 * Server side: plain Node, no DOM. Importing the package and rendering to a
 * string must work without `window`, and produce a link that works as is.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LinkPreview, OmnillinkProvider, safeHttpUrl, useLinkMeta } from '../src/index.js';

describe('on the server', () => {
  it('runs without a DOM', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof customElements).toBe('undefined');
  });

  it('renders the element with a plain link inside', () => {
    const html = renderToString(
      createElement(LinkPreview, { url: 'https://example.com/a?b=1&c=2', baseUrl: 'https://links.example.com', size: 'large', theme: 'dark', loading: 'eager', className: 'card', id: 'p1' }),
    );
    expect(html).toBe(
      '<link-preview id="p1" url="https://example.com/a?b=1&amp;c=2" base-url="https://links.example.com" size="large" theme="dark" loading="eager" class="card">' +
        '<a href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer">https://example.com/a?b=1&amp;c=2</a>' +
        '</link-preview>',
    );
  });

  it('leaves optional attributes out and takes the instance from the provider', () => {
    expect(renderToString(createElement(LinkPreview, { url: 'https://example.com/' }))).toBe(
      '<link-preview url="https://example.com/"><a href="https://example.com/" rel="noopener noreferrer">https://example.com/</a></link-preview>',
    );
    const html = renderToString(
      createElement(OmnillinkProvider, { baseUrl: 'https://links.example.com' }, createElement(LinkPreview, { url: 'https://example.com/' })),
    );
    expect(html).toContain('base-url="https://links.example.com"');
  });

  it('renders your own fallback when given one', () => {
    const html = renderToString(createElement(LinkPreview, { url: 'https://example.com/' }, createElement('a', { href: 'https://example.com/' }, 'Read the article')));
    expect(html).toBe('<link-preview url="https://example.com/"><a href="https://example.com/">Read the article</a></link-preview>');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '/relative', 'https://user:pw@example.com/', ''])(
    'never turns %j into a link',
    (url) => {
      const html = renderToString(createElement(LinkPreview, { url }));
      expect(html).not.toContain('href');
      expect(html).not.toContain('<a');
    },
  );

  it('escapes whatever the URL contains', () => {
    const html = renderToString(createElement(LinkPreview, { url: 'https://example.com/"><script>alert(1)</script>' }));
    expect(html).not.toContain('<script>');
  });

  it('useLinkMeta() reports loading and makes no request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const states: string[] = [];
    function Probe(): null {
      states.push(useLinkMeta('https://example.com/', { baseUrl: 'https://links.example.com' }).status);
      states.push(useLinkMeta(null).status);
      states.push(useLinkMeta('https://example.com/', { enabled: false }).status);
      return null;
    }
    renderToString(createElement(Probe));
    expect(states).toEqual(['loading', 'idle', 'idle']);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('safeHttpUrl()', () => {
  it('accepts absolute http(s) only', () => {
    expect(safeHttpUrl(' https://Example.com/x ')).toBe('https://example.com/x');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
    expect(safeHttpUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHttpUrl('//example.com')).toBeNull();
  });
});
