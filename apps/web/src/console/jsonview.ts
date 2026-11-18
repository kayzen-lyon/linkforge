/**
 * Collapsible JSON viewer with filtering and "copy path".
 *
 * Built from elements and text nodes only: the JSON comes from arbitrary web
 * pages through the API and must never be parsed as markup.
 */
import { h } from '../lib/dom';
import { iconNode } from '../site/icons';

export interface JsonViewText {
  readonly copyPath: (path: string) => string;
  readonly items: (count: number) => string;
}

const MAX_STRING = 1200;
const isContainer = (value: unknown): value is object => typeof value === 'object' && value !== null;

function scalar(value: unknown): HTMLElement {
  if (typeof value === 'string') {
    const shown = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    return h('span', { class: 't-str' }, JSON.stringify(shown));
  }
  if (typeof value === 'number') return h('span', { class: 't-num' }, String(value));
  return h('span', { class: 't-kw' }, String(value));
}

const segment = (path: string, key: string | number): string =>
  typeof key === 'number' ? `${path}.${key}` : path === '' ? key : `${path}.${key}`;

/**
 * Renders `value` into `target`. `onCopy` receives the dot path of the node
 * whose copy button was pressed (`data.image.url`), which is also the syntax
 * of the API's `embed` parameter.
 */
export function renderJson(target: HTMLElement, value: unknown, text: JsonViewText, onCopy: (path: string) => void): void {
  function node(key: string | number | null, item: unknown, path: string, depth: number): HTMLElement {
    const label = key === null ? null : h('span', { class: 'json-key' }, typeof key === 'number' ? String(key) : key);
    const copy =
      path === ''
        ? null
        : h('button', { type: 'button', class: 'json-copy', 'aria-label': text.copyPath(path), 'data-path': path }, iconNode('copy', 'size-3.5'));

    if (!isContainer(item)) {
      const row = h('div', { class: 'json-row', 'data-search': `${String(key ?? '')} ${String(item)}`.toLowerCase() }, label, label === null ? null : ': ', scalar(item), copy);
      return row;
    }
    const entries: Array<[string | number, unknown]> = Array.isArray(item) ? item.map((child, at) => [at, child]) : Object.entries(item);
    const summary = h(
      'summary',
      {},
      label ?? h('span', { class: 'json-key' }, Array.isArray(item) ? '[ ]' : '{ }'),
      h('span', { class: 'json-count' }, text.items(entries.length)),
      copy,
    );
    const children = h('div', { class: 'json-children' }, ...entries.map(([childKey, child]) => node(childKey, child, segment(path, childKey), depth + 1)));
    const details = h('details', { class: 'json-node', 'data-search': String(key ?? '').toLowerCase() }, summary, children);
    details.open = depth < 2;
    return details;
  }

  const tree = h('div', { class: 'json-tree' }, node(null, value, '', 0));
  tree.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>('.json-copy');
    if (button === null) return;
    event.preventDefault();
    onCopy(button.dataset['path'] ?? '');
  });
  target.replaceChildren(tree);
}

/** Shows only the rows whose key or value contains `query`; returns the number of matches. */
export function filterJson(target: HTMLElement, query: string): number {
  const needle = query.trim().toLowerCase();
  let matches = 0;
  const visit = (element: Element): boolean => {
    const own = needle !== '' && (element.getAttribute('data-search') ?? '').includes(needle);
    if (element.classList.contains('json-row')) {
      const shown = needle === '' || own;
      (element as HTMLElement).hidden = !shown;
      element.classList.toggle('json-hit', own);
      if (own) matches += 1;
      return shown;
    }
    let any = false;
    for (const child of element.querySelectorAll(':scope > .json-children > *')) any = visit(child) || any;
    if (own) matches += 1;
    element.classList.toggle('json-hit', own);
    (element as HTMLElement).hidden = needle !== '' && !any && !own;
    if (needle !== '' && (any || own) && element instanceof HTMLDetailsElement) element.open = true;
    // A matching container shows all of its content.
    if (own && !any) for (const child of element.querySelectorAll<HTMLElement>('[hidden]')) child.hidden = false;
    return any || own;
  };
  const rootNode = target.querySelector('.json-tree > *');
  if (rootNode !== null) visit(rootNode);
  return matches;
}

export function setAllOpen(target: HTMLElement, open: boolean): void {
  for (const details of target.querySelectorAll<HTMLDetailsElement>('details.json-node')) details.open = open;
}
