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

describe('extractMetadata — logo, media, keywords and feeds', () => {
  const page = (head: string) => `<html><head><title>T</title>${head}</head><body></body></html>`;
  const extract = (head: string) => extractMetadata(page(head), 'https://example.com/a/b');

  it('prefers the JSON-LD logo, including the publisher one', () => {
    const direct = extract(`
      <link rel="icon" href="/icon.svg">
      <script type="application/ld+json">{"@type":"Organization","logo":"/brand.png"}</script>`);
    expect(direct.logo).toEqual({ url: 'https://example.com/brand.png' });
    expect(direct.favicon).toBe('https://example.com/icon.svg');

    const nested = extract(`<script type="application/ld+json">
      {"@type":"Article","publisher":{"@type":"Organization","logo":{"@type":"ImageObject","url":"https://cdn.example.com/l.png"}}}
    </script>`);
    expect(nested.logo).toEqual({ url: 'https://cdn.example.com/l.png' });
  });

  it('falls back to the largest declared icon, and to null when none is declared', () => {
    const icons = extract(`
      <link rel="icon" sizes="32x32" href="/32.png">
      <link rel="apple-touch-icon" href="/touch.png">
      <link rel="icon" sizes="16x16" href="/16.png">`);
    expect(icons.logo).toEqual({ url: 'https://example.com/touch.png' });

    const none = extract('');
    expect(none.logo).toBeNull();
    // The favicon keeps its conventional default.
    expect(none.favicon).toBe('https://example.com/favicon.ico');
  });

  it('reads Open Graph video and audio', () => {
    const media = extract(`
      <meta property="og:video" content="/v.mp4">
      <meta property="og:video:type" content="video/mp4">
      <meta property="og:video:width" content="1280">
      <meta property="og:video:height" content="720">
      <meta property="og:audio" content="https://cdn.example.com/a.mp3">
      <meta property="og:audio:type" content="audio/mpeg">`);
    expect(media.video).toEqual({
      url: 'https://example.com/v.mp4',
      type: 'video/mp4',
      width: 1280,
      height: 720,
    });
    expect(media.audio).toEqual({ url: 'https://cdn.example.com/a.mp3', type: 'audio/mpeg' });
  });

  it('falls back to twitter:player, then to a JSON-LD VideoObject', () => {
    const player = extract(`
      <meta name="twitter:player" content="https://player.example.com/1">
      <meta name="twitter:player:width" content="640">
      <meta name="twitter:player:height" content="360">`);
    expect(player.video).toEqual({
      url: 'https://player.example.com/1',
      type: 'text/html',
      width: 640,
      height: 360,
    });

    const jsonLd = extract(`<script type="application/ld+json">
      {"@type":"VideoObject","contentUrl":"https://cdn.example.com/v.webm","encodingFormat":"video/webm","width":"1920","height":1080}
    </script>`);
    expect(jsonLd.video).toEqual({
      url: 'https://cdn.example.com/v.webm',
      type: 'video/webm',
      width: 1920,
      height: 1080,
    });

    const none = extract('<meta property="og:video" content="javascript:alert(1)">');
    expect(none.video).toBeNull();
    expect(none.audio).toBeNull();
  });

  it('collects de-duplicated keywords from meta tags, article tags and JSON-LD', () => {
    const { keywords } = extract(`
      <meta name="keywords" content="Alpha, beta ,, ALPHA">
      <meta property="article:tag" content="Gamma">
      <script type="application/ld+json">{"@type":"Article","keywords":["delta","beta"]}</script>`);
    expect(keywords).toEqual(['Alpha', 'beta', 'Gamma', 'delta']);
    expect(extract('').keywords).toEqual([]);
  });

  it('bounds the number of keywords', () => {
    const many = Array.from({ length: 200 }, (_, i) => `k${i}`).join(',');
    expect(extract(`<meta name="keywords" content="${many}">`).keywords).toHaveLength(50);
  });

  it('lists RSS and Atom feeds only', () => {
    const { feeds } = extract(`
      <link rel="alternate" type="application/rss+xml" title="Posts" href="/feed.xml">
      <link rel="alternate" type="application/atom+xml" href="https://example.com/atom">
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
      <link rel="alternate" hreflang="fr" href="/fr">
      <link rel="stylesheet" type="application/rss+xml" href="/not-a-feed">
      <link rel="alternate" type="application/rss+xml" href="javascript:void(0)">`);
    expect(feeds).toEqual([
      { url: 'https://example.com/feed.xml', title: 'Posts', type: 'application/rss+xml' },
      { url: 'https://example.com/atom', title: null, type: 'application/atom+xml' },
    ]);
  });
});
