/** Content model of the guides: plain data, rendered to static HTML once per language. */
import type { Lang as CodeLang } from '../lib/highlight.ts';
import type { GuideId } from '../site/config.ts';

/** A text in both languages. Accepts the inline syntax: `code`, **strong**, [label](href). */
export interface L {
  readonly fr: string;
  readonly en: string;
}
export const l = (fr: string, en: string): L => ({ fr, en });
/** Same text in both languages (code, names, numbers). */
export const same = (value: string): L => ({ fr: value, en: value });

export type Block =
  | { readonly kind: 'h2' | 'h3'; readonly id: string; readonly text: L }
  | { readonly kind: 'p' | 'note'; readonly text: L }
  | { readonly kind: 'ul' | 'ol'; readonly items: readonly L[] }
  | { readonly kind: 'code'; readonly lang: CodeLang; readonly label: L; readonly code: string }
  | { readonly kind: 'table'; readonly head: readonly L[]; readonly rows: ReadonlyArray<readonly L[]> }
  | { readonly kind: 'terms'; readonly items: ReadonlyArray<readonly [L, L]> };

export interface Guide {
  readonly id: GuideId;
  readonly title: L;
  /** Short name for navigation. */
  readonly nav: L;
  readonly description: L;
  readonly lead: L;
  readonly blocks: readonly Block[];
}

export const h2 = (id: string, fr: string, en: string): Block => ({ kind: 'h2', id, text: l(fr, en) });
export const h3 = (id: string, fr: string, en: string): Block => ({ kind: 'h3', id, text: l(fr, en) });
export const p = (fr: string, en: string): Block => ({ kind: 'p', text: l(fr, en) });
export const note = (fr: string, en: string): Block => ({ kind: 'note', text: l(fr, en) });
export const ul = (...items: L[]): Block => ({ kind: 'ul', items });
export const ol = (...items: L[]): Block => ({ kind: 'ol', items });
export const code = (lang: CodeLang, fr: string, en: string, source: string): Block => ({
  kind: 'code',
  lang,
  label: l(fr, en),
  code: source,
});
export const table = (head: L[], rows: L[][]): Block => ({ kind: 'table', head, rows });
export const terms = (...items: Array<[L, L]>): Block => ({ kind: 'terms', items });
