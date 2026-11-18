/**
 * Inline mini-syntax used by the dictionaries: `code`, **strong**, [label](href).
 *
 * Pure (no DOM): the build renders it to escaped HTML, the browser to DOM nodes.
 */

export type Inline =
  | { readonly kind: 'text' | 'code' | 'strong'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

const PATTERN = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(source: string): Inline[] {
  const parts: Inline[] = [];
  let cursor = 0;
  for (const match of source.matchAll(PATTERN)) {
    if (match.index > cursor) parts.push({ kind: 'text', text: source.slice(cursor, match.index) });
    cursor = match.index + match[0].length;
    const [, code, strong, label, href] = match;
    if (code !== undefined) parts.push({ kind: 'code', text: code });
    else if (strong !== undefined) parts.push({ kind: 'strong', text: strong });
    else if (label !== undefined && href !== undefined) parts.push({ kind: 'link', text: label, href });
  }
  if (cursor < source.length) parts.push({ kind: 'text', text: source.slice(cursor) });
  return parts;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const isExternal = (href: string): boolean => /^https?:\/\//.test(href);

export function inlineToHtml(source: string): string {
  return parseInline(source)
    .map((part) => {
      const text = escapeHtml(part.text);
      switch (part.kind) {
        case 'code':
          return `<code>${text}</code>`;
        case 'strong':
          return `<strong>${text}</strong>`;
        case 'link':
          return `<a href="${escapeHtml(part.href)}"${isExternal(part.href) ? ' rel="noopener"' : ''}>${text}</a>`;
        default:
          return text;
      }
    })
    .join('');
}
