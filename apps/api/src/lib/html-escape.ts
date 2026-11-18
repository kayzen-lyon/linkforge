/**
 * Escaping for the few HTML documents the API builds itself (social cards,
 * device frames, PDF header and footer). Every piece of client text goes
 * through {@link escapeHtml}; nothing else is ever interpolated as markup.
 */
const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escapes text for use in HTML content or inside a quoted attribute. */
export function escapeHtml(text: string): string {
  // Control characters have no business in a title; C0 (tab and newline aside) is dropped.
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[&<>"'`]/g, (char) => ENTITIES[char] ?? char);
}
