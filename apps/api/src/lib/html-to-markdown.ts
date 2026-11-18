/**
 * Small HTML → Markdown converter (pure, no I/O).
 *
 * Covers what readable web content is made of: headings, paragraphs, nested
 * lists, links, images, emphasis, inline and fenced code, blockquotes, rules
 * and simple tables. Anything else degrades to its text. The HTML parser is
 * cheerio's (already used for metadata); the conversion itself is hand-written
 * so the API does not pull a Markdown library for a few dozen rules.
 */
import { load } from 'cheerio';

/**
 * The subset of a parsed DOM node the converter reads. Declared structurally
 * so callers can pass cheerio's nodes without this module depending on the
 * parser's own type package.
 */
export interface DomNode {
  /** `text`, `tag`, `script`, `style`, `comment`, `root`... */
  readonly type: string;
  /** Text content, for text nodes. */
  readonly data?: string;
  /** Lower-cased tag name, for elements. */
  readonly name?: string;
  readonly attribs?: Readonly<Record<string, string>>;
  readonly children?: readonly DomNode[];
}

export interface MarkdownOptions {
  /** Used to make relative links and image sources absolute. */
  readonly baseUrl?: string;
  /**
   * Reference-style links: `[label][1]` in the text and a numbered list of
   * URLs at the end, which keeps long URLs out of the prose an LLM reads.
   */
  readonly citations?: boolean;
}

export interface MarkdownLink {
  /** Absolute URL. */
  readonly url: string;
  /** Visible text of the first link pointing there. */
  readonly text: string;
}

export interface MarkdownImage {
  /** Absolute URL of the best available rendition. */
  readonly url: string;
  readonly alt: string;
}

export interface MarkdownDocument {
  readonly markdown: string;
  /** Every http(s) link met, de-duplicated, in document order. */
  readonly links: readonly MarkdownLink[];
  /** Every image met, de-duplicated, in document order. */
  readonly images: readonly MarkdownImage[];
}

/** Elements whose content is never part of the readable text. */
const SKIPPED = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'iframe', 'svg',
  'canvas', 'object', 'embed', 'audio', 'video', 'select', 'option', 'input', 'textarea', 'button',
]);

/** Block containers without Markdown syntax of their own: their children are laid out as blocks. */
const CONTAINERS = new Set([
  'html', 'body', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'figure',
  'figcaption', 'details', 'summary', 'dl', 'dt', 'dd', 'form', 'fieldset', 'address', 'center',
  'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'li',
]);

const HEADINGS: Readonly<Record<string, number>> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

/**
 * Deeper trees are cut off: a hostile page nesting 100 000 `<div>`s must not
 * overflow the stack of this recursive walk.
 */
const MAX_DEPTH = 200;

const isElement = (node: DomNode): boolean =>
  node.type === 'tag' || node.type === 'script' || node.type === 'style';

const isBlock = (node: DomNode): boolean => {
  const name = node.name ?? '';
  return (
    isElement(node) &&
    (CONTAINERS.has(name) ||
      name in HEADINGS ||
      ['p', 'ul', 'ol', 'blockquote', 'pre', 'hr', 'table'].includes(name))
  );
};

/** Raw text of a subtree, untouched (used for code, where whitespace matters). */
function rawText(node: DomNode, depth = 0): string {
  if (node.type === 'text') return node.data ?? '';
  if (depth > MAX_DEPTH) return '';
  if (node.name === 'br') return '\n';
  return (node.children ?? []).map((child) => rawText(child, depth + 1)).join('');
}

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char);

/**
 * Backslash-escapes characters only where Markdown would interpret them.
 *
 * Escaping blindly corrupts what readers and LLMs copy out of the text:
 * `snake_case` identifiers and bare URLs must come out untouched. So:
 * - a bare URL is emitted verbatim;
 * - `_` is escaped unless it sits inside a word (CommonMark never treats an
 *   intraword underscore as emphasis);
 * - `*` is escaped unless it stands alone between spaces;
 * - `<` is escaped only when it could open a tag or an autolink.
 */
export function escapeText(text: string): string {
  return text
    .split(/(https?:\/\/[^\s<>"']+)/)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(/[\\`*_[\]<]/g, (char, offset: number) => {
        const before = part[offset - 1];
        const after = part[offset + 1];
        if (char === '_' && isWordChar(before) && isWordChar(after)) return char;
        if (char === '*' && /\s/.test(before ?? '') && /\s/.test(after ?? '')) return char;
        if (char === '<' && !/[A-Za-z/!?]/.test(after ?? '')) return char;
        return `\\${char}`;
      });
    })
    .join('');
}

/** Lazy-loading attributes that hold the real source while `src` is a placeholder. */
const LAZY_SOURCE_ATTRIBUTES = ['data-src', 'data-lazy-src', 'data-original', 'data-url'];
const SRCSET_ATTRIBUTES = ['srcset', 'data-srcset', 'data-lazy-srcset'];

/**
 * Picks the largest candidate of a `srcset` (`url 800w, url 2x`).
 * Width descriptors outrank density descriptors; a bare URL counts as `1x`.
 */
export function largestSrcsetCandidate(srcset: string): string | null {
  return srcsetCandidates(srcset).sort((x, y) => y.score - x.score)[0]?.url ?? null;
}

function srcsetCandidates(srcset: string): Array<{ url: string; score: number }> {
  const candidates: Array<{ url: string; score: number }> = [];
  // URLs may contain commas, so candidates are read token by token, not split on ','.
  for (const match of srcset.matchAll(/\s*(\S+)(?:\s+(\d*\.?\d+)([wx]))?\s*(?:,|$)/g)) {
    const url = (match[1] ?? '').replace(/,+$/, '');
    if (url === '' || url.startsWith('data:')) continue;
    const value = Number(match[2] ?? '1');
    candidates.push({ url, score: match[3] === 'w' ? 10_000 + value : value });
  }
  return candidates;
}

/**
 * Best source of an `<img>`: the largest `srcset` candidate (its own or its
 * `<picture>` siblings'), else `src`, else a lazy-loading attribute. `data:`
 * placeholders are never returned.
 */
export function bestImageSource(img: DomNode, picture?: DomNode): string | null {
  const holders = [...(picture?.children ?? []).filter((child) => child.name === 'source'), img];
  const candidates = holders.flatMap((holder) =>
    SRCSET_ATTRIBUTES.flatMap((attribute) => srcsetCandidates(holder.attribs?.[attribute] ?? '')),
  );
  const best = candidates.sort((x, y) => y.score - x.score)[0];
  if (best !== undefined) return best.url;
  for (const attribute of ['src', ...LAZY_SOURCE_ATTRIBUTES]) {
    const value = img.attribs?.[attribute]?.trim();
    if (value !== undefined && value !== '' && !value.startsWith('data:')) return value;
  }
  return null;
}

/** Escapes a line that would be read as a heading, list item, quote or rule. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)(#{1,6}(?:\s|$)|>|[-+](?:\s|$)|(?:-{3,}|={3,})\s*$)/, '$1\\$2')
    .replace(/^(\s*\d+)([.)]\s)/, '$1\\$2');
}

/**
 * Decorates the visible part of `inner`, leaving its surrounding whitespace
 * outside: `** bold **` is not emphasis in Markdown, ` **bold** ` is.
 */
function decorate(inner: string, format: (core: string) => string): string {
  const core = inner.trim();
  if (core === '') return inner;
  const lead = inner.slice(0, inner.length - inner.trimStart().length);
  const trail = inner.slice(inner.trimEnd().length);
  return `${lead}${format(core)}${trail}`;
}

const wrap = (inner: string, marker: string): string =>
  decorate(inner, (core) => `${marker}${core}${marker}`);

/** Wraps code in a backtick run longer than any run it contains. */
function inlineCode(code: string): string {
  const text = code.replace(/\s+/g, ' ').trim();
  if (text === '') return '';
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

class Converter {
  readonly links = new Map<string, MarkdownLink>();
  readonly images = new Map<string, MarkdownImage>();
  /** Reference numbers of cited URLs (with `citations`). */
  private readonly references = new Map<string, number>();
  private readonly baseUrl: string | undefined;
  private readonly citations: boolean;

  constructor(options: MarkdownOptions) {
    this.baseUrl = options.baseUrl;
    this.citations = options.citations ?? false;
  }

  /** The reference list closing a document converted with `citations`. */
  referenceList(): string {
    return [...this.references.entries()].map(([url, index]) => `[${index}]: ${url}`).join('\n');
  }

  private link(label: string, href: string): string {
    if (!this.citations) return `[${label}](${href})`;
    let index = this.references.get(href);
    if (index === undefined) {
      index = this.references.size + 1;
      this.references.set(href, index);
    }
    return `[${label}][${index}]`;
  }

  private image(img: DomNode, picture?: DomNode): string {
    const src = this.resolve(bestImageSource(img, picture) ?? undefined, ['http:', 'https:']);
    if (src === null) return '';
    const plainAlt = (img.attribs?.['alt'] ?? '').replace(/\s+/g, ' ').trim();
    if (!this.images.has(src)) this.images.set(src, { url: src, alt: plainAlt });
    return `![${escapeText(plainAlt)}](${src})`;
  }

  /** Absolute form of a link target; `null` for anything that is not safe to emit. */
  private resolve(reference: string | undefined, schemes: readonly string[]): string | null {
    const value = reference?.trim();
    if (value === undefined || value === '') return null;
    try {
      const url = this.baseUrl === undefined ? new URL(value) : new URL(value, this.baseUrl);
      if (!schemes.includes(url.protocol)) return null;
      // A raw parenthesis would end the Markdown link destination early.
      return url.href.replace(/\(/g, '%28').replace(/\)/g, '%29');
    } catch {
      return null;
    }
  }

  /** Renders inline content on a single logical line (`\n` only for `<br>`). */
  inline(nodes: readonly DomNode[], depth: number): string {
    if (depth > MAX_DEPTH) return '';
    let out = '';
    for (const node of nodes) {
      if (node.type === 'text') {
        out += escapeText((node.data ?? '').replace(/\s+/g, ' '));
        continue;
      }
      if (!isElement(node) || SKIPPED.has(node.name ?? '')) continue;

      const children = node.children ?? [];
      switch (node.name) {
        case 'br':
          out += '\n';
          break;
        case 'strong':
        case 'b':
          out += wrap(this.inline(children, depth + 1), '**');
          break;
        case 'em':
        case 'i':
          out += wrap(this.inline(children, depth + 1), '*');
          break;
        case 'del':
        case 's':
        case 'strike':
          out += wrap(this.inline(children, depth + 1), '~~');
          break;
        case 'code':
        case 'kbd':
        case 'samp':
        case 'tt':
          out += inlineCode(rawText(node));
          break;
        case 'a': {
          const text = this.inline(children, depth + 1);
          const href = this.resolve(node.attribs?.['href'], ['http:', 'https:', 'mailto:']);
          if (href !== null && !href.startsWith('mailto:') && !this.links.has(href)) {
            const plain = rawText(node).replace(/\s+/g, ' ').trim().slice(0, 200);
            this.links.set(href, { url: href, text: plain });
          }
          out +=
            href === null
              ? text
              : decorate(text, (label) => this.link(label.replace(/\n/g, ' '), href));
          break;
        }
        case 'img':
          out += this.image(node);
          break;
        case 'picture': {
          const img = children.find((child) => child.name === 'img');
          if (img !== undefined) out += this.image(img, node);
          break;
        }
        default: {
          // A block nested in inline context (`<a><div>…`): keep its text, spaced out.
          const inner = this.inline(children, depth + 1);
          out += isBlock(node) ? ` ${inner} ` : inner;
        }
      }
    }
    return out;
  }

  /** Tidies an inline run into a paragraph; `null` when nothing visible remains. */
  private paragraph(text: string): string | null {
    const lines = text
      .split('\n')
      .map((line) => line.replace(/ {2,}/g, ' ').trim())
      .filter((line) => line !== '');
    return lines.length === 0 ? null : lines.map(escapeLineStart).join('\n');
  }

  /** Lays children out as Markdown blocks (to be joined by blank lines). */
  blocks(nodes: readonly DomNode[], depth: number): string[] {
    if (depth > MAX_DEPTH) return [];
    const out: string[] = [];
    let run: DomNode[] = [];

    const flush = (): void => {
      if (run.length === 0) return;
      const paragraph = this.paragraph(this.inline(run, depth + 1));
      if (paragraph !== null) out.push(paragraph);
      run = [];
    };

    for (const node of nodes) {
      if (!isBlock(node)) {
        if (node.type === 'text' || (isElement(node) && !SKIPPED.has(node.name ?? ''))) {
          run.push(node);
        }
        continue;
      }
      flush();
      out.push(...this.block(node, depth + 1));
    }
    flush();
    return out;
  }

  private block(node: DomNode, depth: number): string[] {
    const name = node.name ?? '';
    const children = node.children ?? [];

    const level = HEADINGS[name];
    if (level !== undefined) {
      const text = this.inline(children, depth).replace(/\s+/g, ' ').trim();
      return text === '' ? [] : [`${'#'.repeat(level)} ${text}`];
    }

    switch (name) {
      case 'p': {
        const paragraph = this.paragraph(this.inline(children, depth));
        return paragraph === null ? [] : [paragraph];
      }
      case 'hr':
        return ['---'];
      case 'pre':
        return this.codeBlock(node);
      case 'blockquote': {
        const inner = this.blocks(children, depth).join('\n\n');
        if (inner === '') return [];
        return [inner.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n')];
      }
      case 'ul':
      case 'ol':
        return this.list(node, depth);
      case 'table':
        return this.table(node, depth);
      default:
        return this.blocks(children, depth);
    }
  }

  private codeBlock(node: DomNode): string[] {
    const code = rawText(node).replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');
    if (code === '') return [];

    const inner = (node.children ?? []).find((child) => child.name === 'code');
    const classes = `${node.attribs?.['class'] ?? ''} ${inner?.attribs?.['class'] ?? ''}`;
    const language = classes.match(/\b(?:language|lang)-([\w+#.-]+)/)?.[1] ?? '';

    const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length));
    const fence = '`'.repeat(longest + 1);
    return [`${fence}${language}\n${code}\n${fence}`];
  }

  private list(node: DomNode, depth: number): string[] {
    const ordered = node.name === 'ol';
    const start = Number.parseInt(node.attribs?.['start'] ?? '1', 10);
    let index = Number.isFinite(start) ? start : 1;
    const lines: string[] = [];

    for (const item of node.children ?? []) {
      if (item.name !== 'li') continue;
      const marker = ordered ? `${index}. ` : '- ';
      index += 1;
      // Tight list: an item's blocks (text, then a nested list) sit on consecutive lines.
      const content = this.blocks(item.children ?? [], depth + 1).join('\n');
      if (content === '') continue;
      const indent = ' '.repeat(marker.length);
      lines.push(
        content
          .split('\n')
          .map((line, i) => (i === 0 ? `${marker}${line}` : line === '' ? '' : `${indent}${line}`))
          .join('\n'),
      );
    }
    return lines.length === 0 ? [] : [lines.join('\n')];
  }

  private table(node: DomNode, depth: number): string[] {
    const rows: DomNode[] = [];
    const collect = (parent: DomNode, level: number): void => {
      for (const child of parent.children ?? []) {
        if (child.name === 'tr') rows.push(child);
        else if (level < 2 && ['thead', 'tbody', 'tfoot'].includes(child.name ?? '')) {
          collect(child, level + 1);
        }
      }
    };
    collect(node, 0);

    const cellsOf = (row: DomNode): DomNode[] =>
      (row.children ?? []).filter((cell) => cell.name === 'td' || cell.name === 'th');
    const columns = Math.max(0, ...rows.map((row) => cellsOf(row).length));

    // One column means a layout table: its cells are ordinary content.
    if (columns < 2) return rows.flatMap((row) => this.blocks(cellsOf(row), depth + 1));

    const lines = rows.map((row) => {
      const cells = cellsOf(row).map((cell) =>
        this.inline(cell.children ?? [], depth + 1)
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\|/g, '\\|'),
      );
      while (cells.length < columns) cells.push('');
      return `| ${cells.join(' | ')} |`;
    });
    // GitHub-flavoured tables require a header row: the first row plays that part.
    lines.splice(1, 0, `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`);
    return [lines.join('\n')];
  }
}

/**
 * Converts parsed DOM nodes to Markdown.
 *
 * @param nodes - Nodes to convert, in document order.
 */
export function nodesToMarkdown(nodes: readonly DomNode[], options: MarkdownOptions = {}): string {
  return convertNodes(nodes, options).markdown;
}

/**
 * Converts parsed DOM nodes to Markdown and reports the links and images met
 * on the way, with the same URL resolution as the Markdown itself.
 */
export function convertNodes(
  nodes: readonly DomNode[],
  options: MarkdownOptions = {},
): MarkdownDocument {
  const converter = new Converter(options);
  const body = converter.blocks(nodes, 0).join('\n\n').trim();
  const references = converter.referenceList();
  return {
    markdown: references === '' ? body : `${body}\n\n${references}`,
    links: [...converter.links.values()],
    images: [...converter.images.values()],
  };
}

/**
 * Converts an HTML fragment or document to Markdown.
 *
 * @param html - Markup to convert; scripts, styles and form controls are dropped.
 * @param options - `baseUrl` makes relative links and images absolute. Without
 *   it, relative references are emitted as plain text.
 */
export function htmlToMarkdown(html: string, options: MarkdownOptions = {}): string {
  const $ = load(html);
  return nodesToMarkdown($('body').toArray(), options);
}
