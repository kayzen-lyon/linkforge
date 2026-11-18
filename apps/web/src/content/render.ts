/** Build-time rendering of the guides: HTML, search index entries and plain text (llms.txt). */
import { tokenize, type Lang as CodeLang } from '../lib/highlight.ts';
import { escapeHtml, inlineToHtml, parseInline } from '../lib/inline.ts';
import type { Lang } from '../site/config.ts';
import { icon } from '../site/icons.ts';
import type { Block, Guide } from './types.ts';

const plainText = (source: string): string =>
  parseInline(source)
    .map((part) => part.text)
    .join('');

/** Code with one element per line, so line numbers can be switched on in CSS. */
export function highlightLines(source: string, lang: CodeLang): string {
  const lines: string[] = [''];
  for (const token of tokenize(source, lang)) {
    token.text.split('\n').forEach((piece, at) => {
      if (at > 0) lines.push('');
      if (piece === '') return;
      const html = token.type === 'plain' ? escapeHtml(piece) : `<span class="t-${token.type}">${escapeHtml(piece)}</span>`;
      lines[lines.length - 1] += html;
    });
  }
  return lines.map((line) => `<span class="line">${line}</span>`).join('\n');
}

let counter = 0;

/** A code block with its header: label, line-number switch and copy button. */
export function codeFigure(label: string, source: string, lang: CodeLang, labelIsKey = false): string {
  counter += 1;
  const id = `code-${counter}`;
  const caption = labelIsKey ? `<span data-i18n="${label}"></span>` : `<span>${escapeHtml(label)}</span>`;
  const multiline = source.includes('\n');
  return `<figure class="code">
  <figcaption class="code-head">
    ${caption}
    <span class="flex items-center gap-1">
      ${multiline ? `<button type="button" class="copy-btn copy-btn-icon" data-toggle-lines aria-pressed="false" data-i18n-attr="aria-label:code.lines">${icon('list', 'size-4')}</button>` : ''}
      <button type="button" class="copy-btn" data-copy="#${id}">${icon('copy', 'size-3.5')}<span data-copy-label data-i18n="copy"></span></button>
    </span>
  </figcaption>
  <pre tabindex="0"><code id="${id}">${highlightLines(source, lang)}</code></pre>
</figure>`;
}

export function resetCodeCounter(): void {
  counter = 0;
}

function block(item: Block, lang: Lang): string {
  switch (item.kind) {
    case 'h2':
    case 'h3':
      return `<${item.kind} id="${item.id}">${inlineToHtml(item.text[lang])}</${item.kind}>`;
    case 'p':
      return `<p>${inlineToHtml(item.text[lang])}</p>`;
    case 'note':
      return `<p class="note">${inlineToHtml(item.text[lang])}</p>`;
    case 'ul':
    case 'ol':
      return `<${item.kind}${item.lang === undefined ? '' : ` lang="${item.lang}"`} class="doc-list${item.kind === 'ol' ? ' doc-list-ordered' : ''}">${item.items.map((entry) => `<li>${inlineToHtml(entry[lang])}</li>`).join('')}</${item.kind}>`;
    case 'code':
      return codeFigure(item.label[lang], item.code, item.lang);
    case 'table': {
      const head = item.head.map((cell) => `<th scope="col">${inlineToHtml(cell[lang])}</th>`).join('');
      const rows = item.rows
        .map((row) => {
          const cells = row.map((cell, at) => {
            if (at === 0) return `<th scope="row">${inlineToHtml(cell[lang])}</th>`;
            const label = item.head[at];
            return `<td><span class="cell-label">${label === undefined ? '' : escapeHtml(plainText(label[lang]))}</span>${inlineToHtml(cell[lang])}</td>`;
          });
          return `<tr>${cells.join('')}</tr>`;
        })
        .join('\n');
      return `<div class="ref-table-wrap"><table class="ref-table ref-table-plain"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case 'terms':
      return `<dl class="terms">${item.items.map(([term, definition]) => `<div><dt>${inlineToHtml(term[lang])}</dt><dd>${inlineToHtml(definition[lang])}</dd></div>`).join('')}</dl>`;
  }
}

export const renderGuideBody = (guide: Guide, lang: Lang): string => guide.blocks.map((item) => block(item, lang)).join('\n');

/** Headings of a guide, for its "on this page" list. */
export const guideHeadings = (guide: Guide, lang: Lang): Array<{ id: string; text: string }> =>
  guide.blocks.flatMap((item) => (item.kind === 'h2' ? [{ id: item.id, text: plainText(item.text[lang]) }] : []));

/** Plain text of a block (search index, llms-full.txt). */
function blockText(item: Block, lang: Lang): string {
  switch (item.kind) {
    case 'h2':
      return `\n## ${plainText(item.text[lang])}\n`;
    case 'h3':
      return `\n### ${plainText(item.text[lang])}\n`;
    case 'p':
    case 'note':
      return plainText(item.text[lang]);
    case 'ul':
    case 'ol':
      return item.items.map((entry) => `- ${plainText(entry[lang])}`).join('\n');
    case 'code':
      return `\`\`\`\n${item.code}\n\`\`\``;
    case 'table':
      return item.rows.map((row) => `- ${row.map((cell) => plainText(cell[lang])).join(' | ')}`).join('\n');
    case 'terms':
      return item.items.map(([term, definition]) => `- ${plainText(term[lang])}: ${plainText(definition[lang])}`).join('\n');
  }
}

export const guideText = (guide: Guide, lang: Lang): string =>
  [`# ${plainText(guide.title[lang])}`, plainText(guide.lead[lang]), ...guide.blocks.map((item) => blockText(item, lang))].join('\n\n');

export interface SearchEntry {
  readonly k: 'p' | 'd';
  readonly t: string;
  readonly u: string;
  readonly p?: string;
  readonly x?: string;
}

/** One search entry per guide, plus one per section with the text under it. */
export function guideSearchEntries(guide: Guide, lang: Lang, url: string): SearchEntry[] {
  const title = plainText(guide.title[lang]);
  const entries: SearchEntry[] = [{ k: 'p', t: title, u: url, x: plainText(guide.description[lang]) }];
  let current: { id: string; title: string; text: string[] } | null = null;
  const flush = (): void => {
    if (current !== null) entries.push({ k: 'd', t: current.title, u: `${url}#${current.id}`, p: title, x: current.text.join(' ').slice(0, 600) });
  };
  for (const item of guide.blocks) {
    if (item.kind === 'h2' || item.kind === 'h3') {
      flush();
      current = { id: item.id, title: plainText(item.text[lang]), text: [] };
    } else if (current !== null && item.kind !== 'code') {
      current.text.push(blockText(item, lang));
    }
  }
  flush();
  return entries;
}
