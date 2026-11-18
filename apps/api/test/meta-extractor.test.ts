import { describe, expect, it } from 'vitest';

import { extractMetadata, needsBrowserRender } from '../src/services/meta-extractor.js';

const RICH = `<!doctype html>
<html lang="fr">
<head>
  <title>Fallback title</title>
  <meta property="og:title" content="  Un   article   riche ">
  <meta property="og:description" content="Description OG">
  <meta property="og:site_name" content="Le Journal">
  <meta property="og:image" content="/img/cover.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Couverture">
  <meta property="og:image" content="https://cdn.example.com/second.jpg">
  <meta name="twitter:image" content="/img/cover.png">
  <meta property="article:published_time" content="2025-03-04T10:00:00+01:00">
  <link rel="canonical" href="/articles/riche">
  <link rel="icon" href="/favicon-16.png" sizes="16x16">
  <link rel="icon" href="/favicon-96.png" sizes="96x96">
  <script type="application/ld+json">{ this is : not json }</script>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"Article","headline":"Titre LD","author":{"@type":"Person","name":"Ada Lovelace"}},
      {"@type":"Organization","name":"Le Journal"}
    ]}
  </script>
</head>
<body><h1>Heading</h1><p>${'Du contenu. '.repeat(40)}</p></body>
</html>`;

describe('extractMetadata', () => {
  const meta = extractMetadata(RICH, 'https://example.com/articles/riche?utm=1');

  it('prefers Open Graph and normalises whitespace', () => {
    expect(meta.title).toBe('Un article riche');
    expect(meta.description).toBe('Description OG');
    expect(meta.publisher).toBe('Le Journal');
    expect(meta.lang).toBe('fr');
  });

  it('resolves relative URLs against the document', () => {
    expect(meta.canonicalUrl).toBe('https://example.com/articles/riche');
    expect(meta.favicon).toBe('https://example.com/favicon-96.png');
  });

  it('groups og:image structured properties and de-duplicates images', () => {
    expect(meta.images).toHaveLength(2);
    expect(meta.image).toEqual({
      url: 'https://example.com/img/cover.png',
      width: 1200,
      height: 630,
      type: null,
      alt: 'Couverture',
    });
    expect(meta.images[1]?.url).toBe('https://cdn.example.com/second.jpg');
  });

  it('parses JSON-LD, flattens @graph and survives invalid blocks', () => {
    expect(meta.jsonLd).toHaveLength(2);
    expect(meta.author).toBe('Ada Lovelace');
  });

  it('normalises dates to ISO 8601', () => {
    expect(meta.date).toBe('2025-03-04T09:00:00.000Z');
  });

  it('does not request a browser render for a rich static page', () => {
    expect(needsBrowserRender(meta, RICH)).toBe(false);
  });
});

describe('fallbacks', () => {
  it('falls back to <title>, meta description and /favicon.ico', () => {
    const html =
      '<html><head><title>Plain</title><meta name="description" content="Desc"></head><body></body></html>';
    const meta = extractMetadata(html, 'https://example.org/deep/page');
    expect(meta.title).toBe('Plain');
    expect(meta.description).toBe('Desc');
    expect(meta.favicon).toBe('https://example.org/favicon.ico');
    expect(meta.image).toBeNull();
  });

  it('ignores non-http image references', () => {
    const html = '<head><meta property="og:image" content="javascript:alert(1)"></head>';
    expect(extractMetadata(html, 'https://example.org/').images).toEqual([]);
  });

  it('flags an empty client-side-rendered shell for browser rendering', () => {
    const html =
      '<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
    expect(needsBrowserRender(extractMetadata(html, 'https://example.org/'), html)).toBe(true);
  });
});
