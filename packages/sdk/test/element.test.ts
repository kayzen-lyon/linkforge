import { describe, expect, it } from 'vitest';

import { buildCardModel, cleanText } from '../src/element/model.js';
import { displayHost, safeHttpUrl } from '../src/element/safe-url.js';

describe('safeHttpUrl()', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['http://example.com/a?b=1#c', 'http://example.com/a?b=1#c'],
    ['  HTTPS://Example.COM/x  ', 'https://example.com/x'],
  ])('accepts %j', (input, expected) => {
    expect(safeHttpUrl(input)).toBe(expected);
  });

  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['  javascript:alert(1)'],
    ['java\nscript:alert(1)'],
    ['java\tscript:alert(1)'],
    ['\u0001javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['data:image/svg+xml,<svg onload=alert(1)>'],
    ['vbscript:msgbox(1)'],
    ['blob:https://example.com/uuid'],
    ['file:///etc/passwd'],
    ['//example.com/x'],
    ['/relative/path'],
    ['example.com'],
    [''],
    ['https://user:pass@example.com/'],
    ['https://trusted.example@evil.test/'],
    [`https://example.com/${'a'.repeat(5000)}`],
    [null],
    [undefined],
    [42],
    [{ toString: () => 'https://example.com' }],
  ])('rejects %j', (input) => {
    expect(safeHttpUrl(input)).toBeNull();
  });
});

describe('displayHost()', () => {
  it('drops www. and survives garbage', () => {
    expect(displayHost('https://www.Example.com/x')).toBe('example.com');
    expect(displayHost('nope')).toBe('');
  });
});

describe('cleanText()', () => {
  it('flattens whitespace and control characters', () => {
    expect(cleanText('  a\n\tb\u0000c   d ', 100)).toBe('a b c d');
  });
  it('returns null for empty or non-string values', () => {
    expect(cleanText('  \n ', 10)).toBeNull();
    expect(cleanText(12, 10)).toBeNull();
    expect(cleanText(null, 10)).toBeNull();
  });
  it('truncates on code points with an ellipsis', () => {
    expect(cleanText('abcdefghij', 5)).toBe('abcd…');
    expect(cleanText('😀😀😀😀😀😀', 3)).toBe('😀😀…');
  });
});

describe('buildCardModel()', () => {
  const requested = 'https://short.test/abc';
  const full = {
    url: 'https://www.news.example/article/1',
    title: ' A  title\nover two lines ',
    description: 'Some description.',
    publisher: 'The Example Times',
    lang: 'en-GB',
    image: { url: 'https://cdn.example/og.png', width: 1200, height: 630, type: null, alt: null },
    images: [],
    favicon: 'https://www.news.example/favicon.ico',
    logo: { url: 'https://www.news.example/logo.svg' },
  };

  it('maps a complete answer', () => {
    expect(buildCardModel(full, requested)).toEqual({
      href: requested,
      host: 'news.example',
      title: 'A title over two lines',
      description: 'Some description.',
      publisher: 'The Example Times',
      imageUrl: 'https://cdn.example/og.png',
      iconUrl: 'https://www.news.example/logo.svg',
      monogram: 'T',
      lang: 'en-GB',
    });
  });

  it('always links to the requested URL, never to one from the answer', () => {
    const model = buildCardModel({ ...full, url: 'javascript:alert(1)' }, requested);
    expect(model.href).toBe(requested);
    expect(model.host).toBe('short.test');
  });

  it('falls back when fields are missing', () => {
    const model = buildCardModel({ url: 'https://blog.example/', title: null, publisher: null }, requested);
    expect(model).toMatchObject({
      title: 'blog.example',
      description: null,
      publisher: null,
      imageUrl: null,
      iconUrl: null,
      monogram: 'B',
      lang: null,
    });
  });

  it('uses the favicon without a logo, and the next usable image', () => {
    const model = buildCardModel(
      {
        ...full,
        logo: null,
        image: { url: 'javascript:alert(1)' },
        images: [{ url: 'data:image/png;base64,AAAA' }, 'nope', { url: 'https://cdn.example/second.jpg' }],
      },
      requested,
    );
    expect(model.iconUrl).toBe('https://www.news.example/favicon.ico');
    expect(model.imageUrl).toBe('https://cdn.example/second.jpg');
  });

  it('hides a publisher that only repeats the host', () => {
    expect(buildCardModel({ ...full, publisher: 'News.Example' }, requested).publisher).toBeNull();
  });

  it('drops every unsafe URL and keeps markup as inert text', () => {
    const model = buildCardModel(
      {
        url: 'https://evil.test/',
        title: '<img src=x onerror="alert(1)">',
        description: '<script>alert(1)</script>',
        publisher: '"><svg onload=alert(1)>',
        lang: 'en"><script>',
        image: { url: 'javascript:alert(1)' },
        images: [{ url: 'JAVASCRIPT:alert(2)' }],
        favicon: 'data:text/html,<script>alert(3)</script>',
        logo: { url: ' javascript:alert(4)' },
      },
      requested,
    );
    expect(model.imageUrl).toBeNull();
    expect(model.iconUrl).toBeNull();
    expect(model.lang).toBeNull();
    // Text is carried verbatim: the element writes it with textContent.
    expect(model.title).toBe('<img src=x onerror="alert(1)">');
    expect(model.description).toBe('<script>alert(1)</script>');
  });

  it.each([[null], [undefined], ['<html>'], [[]], [42]])('survives a %j answer', (data) => {
    expect(buildCardModel(data, requested)).toMatchObject({
      href: requested,
      host: 'short.test',
      title: 'short.test',
      imageUrl: null,
      iconUrl: null,
    });
  });

  it('ignores wrongly typed fields', () => {
    const model = buildCardModel(
      { title: { toString: () => 'x' }, description: 5, publisher: ['a'], image: 'https://a.test/i.png', favicon: {} },
      requested,
    );
    expect(model).toMatchObject({ title: 'short.test', description: null, publisher: null, imageUrl: null, iconUrl: null });
  });
});

describe('importing the element entry without a DOM', () => {
  it('does not throw and registers nothing', async () => {
    expect(typeof HTMLElement).toBe('undefined');
    const module = await import('../src/element.js');
    expect(module.TAG_NAME).toBe('link-preview');
    expect(typeof module.LinkPreviewElement).toBe('function');
  });
});
