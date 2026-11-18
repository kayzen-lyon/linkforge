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

/** Backslash-escapes the characters that would otherwise start Markdown syntax. */
function escapeText(text: string): string {
  return text.replace(/[\\`*_[\]<]/g, '\\$&');
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
  constructor(private readonly baseUrl: string | undefined) {}

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
          out +=
            href === null
              ? text
              : decorate(text, (label) => `[${label.replace(/\n/g, ' ')}](${href})`);
          break;
        }
        case 'img': {
          const src = this.resolve(node.attribs?.['src'], ['http:', 'https:']);
          const alt = escapeText((node.attribs?.['alt'] ?? '').replace(/\s+/g, ' ').trim());
          if (src !== null) out += `![${alt}](${src})`;
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
  return new Converter(options.baseUrl).blocks(nodes, 0).join('\n\n').trim();
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
