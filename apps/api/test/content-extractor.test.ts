import { describe, expect, it } from 'vitest';

import { extractContent } from '../src/services/content-extractor.js';

const SENTENCE = 'The quick brown fox jumps over the lazy dog near the river bank. ';

const ARTICLE = `<!doctype html><html lang="en-GB"><head>
  <title>Fallback</title>
  <meta property="og:title" content="A readable article">
  <meta name="description" content="What the article is about.">
  <style>body { color: red; }</style>
</head><body>
  <header><a href="/">Site name</a></header>
  <nav><a href="/a">NAVIGATION LINK</a></nav>
  <main>
    <article>
      <h1>A readable article</h1>
      <p>${SENTENCE.repeat(5)}</p>
      <h2>Details</h2>
      <p>See <a href="/more">more details</a> here.</p>
      <ul><li>First point</li><li>Second point</li></ul>
      <script>trackEverything();</script>
    </article>
    <aside>RELATED SIDEBAR</aside>
  </main>
  <footer>FOOTER COPYRIGHT</footer>
</body></html>`;

describe('extractContent', () => {
  it('keeps the article and strips navigation, sidebars, scripts and footers', () => {
    const content = extractContent(ARTICLE, 'https://example.com/blog/post');

    expect(content).toMatchObject({
      url: 'https://example.com/blog/post',
      title: 'A readable article',
      lang: 'en-GB',
      excerpt: 'What the article is about.',
    });
    expect(content.text).toContain('The quick brown fox');
    expect(content.text).toContain('First point\nSecond point');
    for (const noise of ['NAVIGATION', 'SIDEBAR', 'FOOTER', 'trackEverything', 'Site name', 'color: red']) {
      expect(content.text).not.toContain(noise);
      expect(content.markdown).not.toContain(noise);
    }
    expect(content.markdown).toContain('# A readable article');
    expect(content.markdown).toContain('## Details');
    expect(content.markdown).toContain('[more details](https://example.com/more)');
    expect(content.markdown).toContain('- First point\n- Second point');
  });

  it('counts words and estimates the reading time', () => {
    const html = `<article><p>${'word '.repeat(450)}</p></article>`;
    const content = extractContent(html, 'https://example.com/');
    expect(content.wordCount).toBe(450);
    expect(content.readingTimeMinutes).toBe(3);
  });

  it('prefers the landmark that holds the content over a tiny one', () => {
    const html = `<body><article>Short teaser</article>
      <main><p>${SENTENCE.repeat(6)}</p></main></body>`;
    const content = extractContent(html, 'https://example.com/');
    expect(content.text).toContain('quick brown fox');
    expect(content.text).not.toContain('Short teaser');
  });

  it('falls back to the densest block when the page has no landmark', () => {
    const html = `<body>
      <div id="menu"><a href="/1">Menu one</a> <a href="/2">Menu two</a></div>
      <div id="post"><p>${SENTENCE.repeat(3)}</p><p>${SENTENCE.repeat(3)}</p></div>
      <div id="links"><p>Tiny note</p></div>
    </body>`;
    const content = extractContent(html, 'https://example.com/');
    expect(content.text).toContain('quick brown fox');
    expect(content.text).not.toContain('Menu one');
    expect(content.text).not.toContain('Tiny note');
  });

  it('falls back to the whole body and derives the excerpt from the text', () => {
    const content = extractContent('<body><div>Just a short line</div></body>', 'https://example.com/');
    expect(content.text).toBe('Just a short line');
    expect(content.excerpt).toBe('Just a short line');
    expect(content.wordCount).toBe(4);
    expect(content.readingTimeMinutes).toBe(1);
  });

  it('handles an empty document', () => {
    expect(extractContent('', 'https://example.com/')).toMatchObject({
      title: null,
      excerpt: null,
      text: '',
      markdown: '',
      wordCount: 0,
      readingTimeMinutes: 0,
    });
  });

  it('caps the output size', () => {
    const html = `<article><p>${'lorem '.repeat(120_000)}</p></article>`;
    const content = extractContent(html, 'https://example.com/');
    expect(content.text.length).toBeLessThanOrEqual(500_001);
    expect(content.markdown.length).toBeLessThanOrEqual(500_001);
  });
});
