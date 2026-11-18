import { OmnillinkError, type LinkMetadata, type OmnillinkResult } from '@omnillink/sdk';
import { describe, expect, it } from 'vitest';

import { fileNameFor, resolveInside } from '../src/files.js';
import { clean, createStyle, formatBytes, formatError, formatExtract, formatMeta, shouldUseColor, truncate } from '../src/format.js';

const RESPONSE = {
  status: 200,
  cache: 'HIT',
  renderSource: 'http',
  requestId: 'req-1',
  etag: null,
  rateLimit: null,
  finalUrl: null,
  animationFrames: null,
  qrVersion: null,
} as const;

const plain = createStyle(false);
const colored = createStyle(true);

const result = (overrides: Partial<LinkMetadata> = {}): OmnillinkResult<LinkMetadata> => ({
  data: {
    url: 'https://example.com/',
    canonicalUrl: 'https://example.com/',
    title: 'Example Domain',
    description: 'An example.',
    author: null,
    publisher: 'Example',
    lang: 'en',
    date: '2025-03-04T09:00:00.000Z',
    dateModified: null,
    type: null,
    themeColor: null,
    robots: null,
    oembed: null,
    alternates: [],
    twitter: { card: null, site: null },
    paywalled: null,
    domain: 'example.com',
    image: { url: 'https://example.com/og.png', width: 1200, height: 630, type: 'image/png', alt: null },
    images: [],
    favicon: 'https://example.com/favicon.ico',
    logo: null,
    video: null,
    audio: null,
    keywords: [],
    feeds: [],
    jsonLd: [],
    contentType: 'text/html',
    ...overrides,
  },
  meta: { cached: true, source: 'http', durationMs: 12.4 },
  response: RESPONSE,
});

describe('formatMeta()', () => {
  it('prints a tidy summary without colours', () => {
    expect(formatMeta(result(), plain)).toBe(
      [
        'Example Domain',
        '  https://example.com/',
        '  An example.',
        '',
        '  Publisher  Example',
        '  Date       2025-03-04',
        '  Language   en',
        '  Image      https://example.com/og.png (1200×630)',
        '  Favicon    https://example.com/favicon.ico',
        '  Type       text/html',
        '  http · 12 ms · cached',
      ].join('\n'),
    );
  });

  it('uses ANSI sequences only when colours are on', () => {
    expect(formatMeta(result(), plain)).not.toContain('\u001b');
    expect(formatMeta(result(), colored)).toContain('\u001b[1mExample Domain\u001b[22m');
  });

  it('removes control characters a hostile page put in its metadata', () => {
    const text = formatMeta(result({ title: 'Evil\u001b[2J\u001b]0;pwned\u0007 title', description: 'a\u202eb\r\nc' }), plain);
    expect(text).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202e]/);
    expect(text.split('\n')[0]).toBe('Evil[2J]0;pwned title');
    expect(text).toContain('  ab c');
  });

  it('copes with a page that declares nothing', () => {
    const text = formatMeta(result({ title: null, description: null, publisher: null, image: null, favicon: null, date: null, lang: null, contentType: null }), plain);
    expect(text).toBe(['(no title)', '  https://example.com/', '', '  http · 12 ms · cached'].join('\n'));
  });
});

describe('formatExtract()', () => {
  it('lists scalars, arrays and missing values', () => {
    const text = formatExtract(
      { data: { url: 'https://a.test/', fields: { price: 42, links: ['https://a.test/1', 'https://a.test/2'], none: null } }, meta: { cached: false, source: 'browser', durationMs: 5 } } as never,
      plain,
    );
    expect(text).toBe(
      ['https://a.test/', '  price  42', '  links  2 matches', '         - https://a.test/1', '         - https://a.test/2', '  none   —', '  browser · 5 ms · fresh'].join('\n'),
    );
  });
});

describe('formatError()', () => {
  it('shows the code, the status, the message and what to do', () => {
    const error = new OmnillinkError({ code: 'ERATELIMIT', status: 429, message: 'Too many requests', retryAfter: 7 });
    expect(formatError(error, 'https://a.test/', plain)).toBe(
      ['✗ ERATELIMIT (HTTP 429) https://a.test/', '  Too many requests Retry in 7 s.', '  The quota of the current window is used up.'].join('\n'),
    );
  });
});

describe('helpers', () => {
  it('cleans, truncates and sizes', () => {
    expect(clean('  a\tb\n\u0007c  ')).toBe('a b c');
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect([formatBytes(12), formatBytes(48_200), formatBytes(2_500_000)]).toEqual(['12 B', '48.2 kB', '2.5 MB']);
  });

  it('decides on colours: flag, NO_COLOR, FORCE_COLOR, then the terminal', () => {
    expect(shouldUseColor({ flag: undefined, env: {}, isTTY: true })).toBe(true);
    expect(shouldUseColor({ flag: undefined, env: {}, isTTY: false })).toBe(false);
    expect(shouldUseColor({ flag: undefined, env: { NO_COLOR: '1' }, isTTY: true })).toBe(false);
    expect(shouldUseColor({ flag: undefined, env: { NO_COLOR: '' }, isTTY: true })).toBe(true);
    expect(shouldUseColor({ flag: undefined, env: { FORCE_COLOR: '1' }, isTTY: false })).toBe(true);
    expect(shouldUseColor({ flag: undefined, env: { TERM: 'dumb' }, isTTY: true })).toBe(false);
    expect(shouldUseColor({ flag: true, env: { NO_COLOR: '1' }, isTTY: false })).toBe(true);
    expect(shouldUseColor({ flag: false, env: { FORCE_COLOR: '1' }, isTTY: true })).toBe(false);
  });
});

describe('file names for --output-dir', () => {
  it('derives a readable, unique name', () => {
    expect(fileNameFor('https://Example.com/Blog/Post?id=1', 'png')).toMatch(/^example\.com-blog-post-[0-9a-f]{8}\.png$/);
    expect(fileNameFor('https://example.com/a', 'png')).not.toBe(fileNameFor('https://example.com/a?x', 'png'));
  });

  it.each([
    'https://example.com/../../etc/passwd',
    'https://example.com/..%2f..%2fetc%2fpasswd',
    'https://example.com/a\\..\\..\\b',
    '../../outside',
    '/etc/passwd',
    '.bashrc',
    'https://example.com/\u0000nul',
    'C:\\Windows\\system32',
  ])('cannot be steered out of the directory by %j', (url) => {
    const name = fileNameFor(url, 'png');
    expect(name).toMatch(/^[a-z0-9][a-z0-9.-]*-[0-9a-f]{8}\.png$/);
    expect(name).not.toContain('..');
    expect(resolveInside('/tmp/out', name)).toBe(`/tmp/out/${name}`);
  });

  it('refuses a name that escapes', () => {
    expect(() => resolveInside('/tmp/out', '../x.png')).toThrow(/outside/);
    expect(() => resolveInside('/tmp/out', 'a/b.png')).toThrow(/outside/);
    expect(() => resolveInside('/tmp/out', '/etc/passwd')).toThrow(/outside/);
  });
});
