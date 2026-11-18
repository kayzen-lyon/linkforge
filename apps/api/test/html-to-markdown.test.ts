import { describe, expect, it } from 'vitest';

import { htmlToMarkdown } from '../src/lib/html-to-markdown.js';

const md = (html: string, baseUrl = 'https://example.com/docs/page') =>
  htmlToMarkdown(html, { baseUrl });

describe('htmlToMarkdown', () => {
  it('converts headings and paragraphs', () => {
    expect(md('<h1>Title</h1><p>First  paragraph.</p><h3>Sub <em>section</em></h3><p>Second.</p>'))
      .toBe('# Title\n\nFirst paragraph.\n\n### Sub *section*\n\nSecond.');
  });

  it('treats loose text between blocks as paragraphs', () => {
    expect(md('<div>Loose text<p>Para</p>tail <b>bold</b></div>')).toBe(
      'Loose text\n\nPara\n\ntail **bold**',
    );
  });

  it('converts emphasis, keeping whitespace outside the markers', () => {
    expect(md('<p>a<strong> bold </strong>b <i>it</i> <del>gone</del> <b></b></p>')).toBe(
      'a **bold** b *it* ~~gone~~',
    );
  });

  it('resolves links and images against the base URL', () => {
    expect(md('<p><a href="../a(b).html">A link</a> <img src="/i.png" alt="An image"></p>')).toBe(
      '[A link](https://example.com/a%28b%29.html) ![An image](https://example.com/i.png)',
    );
  });

  it('never emits dangerous or unusable link targets', () => {
    expect(md('<p><a href="javascript:alert(1)">click</a> <a href="mailto:a@b.co">mail</a></p>'))
      .toBe('click [mail](mailto:a@b.co)');
    expect(md('<p><img src="data:image/png;base64,AAAA" alt="inline">x</p>')).toBe('x');
    // Without a base URL a relative reference cannot be made absolute: keep the text only.
    expect(htmlToMarkdown('<a href="/relative">text</a>')).toBe('text');
  });

  it('converts nested and ordered lists', () => {
    const html = `<ul><li>One</li><li>Two<ol start="3"><li>Three</li><li>Four</li></ol></li></ul>`;
    expect(md(html)).toBe('- One\n- Two\n  3. Three\n  4. Four');
  });

  it('converts inline code and fenced code blocks without escaping their content', () => {
    expect(md('<p>Run <code>npm_install *</code> or <code>a `tick`</code></p>')).toBe(
      'Run `npm_install *` or `` a `tick` ``',
    );
    expect(md('<pre><code class="language-ts">const a = 1;\n  if (a) { b(); }\n</code></pre>')).toBe(
      '```ts\nconst a = 1;\n  if (a) { b(); }\n```',
    );
    expect(md('<pre>has ``` inside</pre>')).toBe('````\nhas ``` inside\n````');
  });

  it('converts blockquotes, including nested blocks', () => {
    expect(md('<blockquote><p>Quote</p><ul><li>item</li></ul></blockquote>')).toBe(
      '> Quote\n>\n> - item',
    );
  });

  it('converts rules, line breaks and tables', () => {
    expect(md('<p>a<br>b</p><hr>')).toBe('a\nb\n\n---');
    expect(md('<table><tr><th>Name</th><th>Qty</th></tr><tr><td>A|B</td><td>2</td></tr></table>'))
      .toBe('| Name | Qty |\n| --- | --- |\n| A\\|B | 2 |');
    // A single-column table is layout, not data.
    expect(md('<table><tr><td><p>Just text</p></td></tr></table>')).toBe('Just text');
  });

  it('escapes characters that would be read as Markdown syntax', () => {
    expect(md('<p>2 * 3 = 6, snake_case, [not a link], &lt;b&gt;</p>')).toBe(
      '2 \\* 3 = 6, snake\\_case, \\[not a link\\], \\<b>',
    );
    expect(md('<p># not a heading</p><p>1. not a list</p><p>- nor this</p><p>&gt; nor that</p>'))
      .toBe('\\# not a heading\n\n1\\. not a list\n\n\\- nor this\n\n\\> nor that');
  });

  it('drops scripts, styles and form controls', () => {
    expect(
      md('<p>Keep</p><script>alert(1)</script><style>p{}</style><button>Buy</button><svg><text>x</text></svg>'),
    ).toBe('Keep');
  });

  it('returns an empty string for empty input and survives absurd nesting', () => {
    expect(md('')).toBe('');
    expect(md('   <div> </div> ')).toBe('');
    const deep = `${'<div>'.repeat(5000)}deep${'</div>'.repeat(5000)}`;
    expect(() => md(deep)).not.toThrow();
  });
});
