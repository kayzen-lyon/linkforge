/**
 * Minimal, safe Markdown renderer for the `/content` demo.
 *
 * The input comes from arbitrary web pages, so it is treated as hostile: the
 * renderer only ever creates a fixed set of elements and text nodes. Raw HTML
 * in the source is shown as text, links are kept only when they are http(s),
 * and images are never loaded (they are shown as a labelled link).
 *
 * Supported: headings, paragraphs, flat lists, block quotes, fenced code,
 * rules, and inline code / bold / italic / links.
 */
import { h, safeHttpUrl } from './dom';

const INLINE =
  /`([^`\n]+)`|!\[([^\]\n]*)\]\(([^)\s]+)[^)\n]*\)|\[([^\]\n]+)\]\(([^)\s]+)[^)\n]*\)|\*\*([^\n]+?)\*\*|__([^\n]+?)__|\*([^*\s][^*\n]*?)\*|\b_([^_\s][^_\n]*?)_\b/g;

function appendInline(parent: HTMLElement, text: string, depth = 0): void {
  if (depth > 4) {
    parent.append(text);
    return;
  }
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index;
    if (start > cursor) parent.append(text.slice(cursor, start));
    cursor = start + match[0].length;

    const [whole, code, imageAlt, imageUrl, linkText, linkUrl, bold1, bold2, em1, em2] = match;
    if (code !== undefined) {
      parent.append(h('code', {}, code));
    } else if (imageUrl !== undefined) {
      const href = safeHttpUrl(imageUrl);
      const label = `Image: ${imageAlt === undefined || imageAlt === '' ? 'untitled' : imageAlt}`;
      parent.append(
        href === null
          ? label
          : h('a', { href, target: '_blank', rel: 'noopener noreferrer nofollow' }, label),
      );
    } else if (linkText !== undefined && linkUrl !== undefined) {
      const href = safeHttpUrl(linkUrl);
      if (href === null) {
        appendInline(parent, linkText, depth + 1);
      } else {
        const link = h('a', { href, target: '_blank', rel: 'noopener noreferrer nofollow' });
        appendInline(link, linkText, depth + 1);
        parent.append(link);
      }
    } else if (bold1 !== undefined || bold2 !== undefined) {
      const strong = h('strong');
      appendInline(strong, bold1 ?? bold2 ?? '', depth + 1);
      parent.append(strong);
    } else if (em1 !== undefined || em2 !== undefined) {
      const em = h('em');
      appendInline(em, em1 ?? em2 ?? '', depth + 1);
      parent.append(em);
    } else {
      parent.append(whole);
    }
  }
  if (cursor < text.length) parent.append(text.slice(cursor));
}

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?/;
const ITEM = /^\s*(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/;

function isBlockStart(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);
}

function renderBlocks(parent: HTMLElement, lines: readonly string[], depth: number): void {
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      index += 1; // closing fence
      parent.append(h('pre', {}, h('code', {}, body.join('\n'))));
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      // The demo sits under an <h2>/<h3>: shift levels so the page outline stays valid.
      const level = Math.min((heading[1] ?? '#').length + 3, 6) as 4 | 5 | 6;
      const node = h(`h${level}`, { 'data-level': String((heading[1] ?? '#').length) });
      appendInline(node, heading[2] ?? '');
      parent.append(node);
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      parent.append(h('hr'));
      index += 1;
      continue;
    }

    if (QUOTE.test(line) && depth < 3) {
      const body: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index] ?? '')) {
        body.push((lines[index] ?? '').replace(QUOTE, ''));
        index += 1;
      }
      const quote = h('blockquote');
      renderBlocks(quote, body, depth + 1);
      parent.append(quote);
      continue;
    }

    const first = ITEM.exec(line);
    if (first !== null) {
      const ordered = first[2] !== undefined;
      const list = h(ordered ? 'ol' : 'ul');
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const item = ITEM.exec(current);
        if (item === null || (item[2] !== undefined) !== ordered) break;
        let text = item[3] ?? '';
        index += 1;
        // Indented continuation lines belong to the same item.
        while (index < lines.length && /^\s+\S/.test(lines[index] ?? '') && !ITEM.test(lines[index] ?? '')) {
          text += ` ${(lines[index] ?? '').trim()}`;
          index += 1;
        }
        const node = h('li');
        appendInline(node, text);
        list.append(node);
      }
      parent.append(list);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && (lines[index] ?? '').trim() !== '' && !isBlockStart(lines[index] ?? '')) {
      paragraph.push((lines[index] ?? '').trim());
      index += 1;
    }
    const node = h('p');
    appendInline(node, paragraph.join(' '));
    parent.append(node);
  }
}

/** Renders Markdown into `target` using safe DOM construction only. */
export function renderMarkdown(target: HTMLElement, markdown: string): void {
  const root = h('div');
  renderBlocks(root, markdown.replace(/\r\n?/g, '\n').split('\n'), 0);
  target.replaceChildren(...root.childNodes);
}
