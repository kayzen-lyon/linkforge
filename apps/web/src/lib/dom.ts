/** Small DOM helpers shared by the pages. Nothing here ever parses HTML. */
import { tokenize, type Lang } from './highlight';

/** Looks an element up by id and fails loudly if the markup drifted. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing element #${id}`);
  return node as T;
}

type Child = Node | string | null | undefined;

/**
 * Creates an element. `props` are set as attributes (`class`, `href`, `aria-*`…);
 * string children become text nodes, so untrusted text can never turn into markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Readonly<Record<string, string>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) node.setAttribute(name, value);
  for (const child of children) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

/** Replaces the content of `target` with syntax-coloured `code`, built from text nodes. */
export function renderCode(target: HTMLElement, code: string, lang: Lang): void {
  const fragment = document.createDocumentFragment();
  for (const token of tokenize(code, lang)) {
    fragment.append(
      token.type === 'plain' ? token.text : h('span', { class: `t-${token.type}` }, token.text),
    );
  }
  target.replaceChildren(fragment);
}

/** Returns `value` when it is an absolute http(s) URL, otherwise `null`. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Copies text to the clipboard; resolves to whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
