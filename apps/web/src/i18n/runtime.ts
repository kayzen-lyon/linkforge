/**
 * Client-side language handling.
 *
 * Every page is built once per language (French at the root, English under
 * `/en`), so the HTML a visitor or a crawler receives is already in the
 * language of its URL. This module adds comfort on top: the FR / EN switch
 * re-renders the page in place and moves to the other URL with `pushState`,
 * so no state is lost (a demo result stays on screen). Elements carry
 * `data-i18n="key"` for content and `data-i18n-attr="attr:key;…"` for attributes.
 */
import { h } from '../lib/dom';
import { isExternal, parseInline } from '../lib/inline';
import { STORAGE, isLang, localizeHref, pagePath, parsePath, type Lang } from '../site/config';

export type { Lang };
export type Vars = Readonly<Record<string, string | number>>;

export interface I18n<K extends string> {
  /** Plain-text translation, with `{name}` placeholders replaced. */
  t(key: K, vars?: Vars): string;
  /** Renders a translation with its inline markup into `target`. */
  render(target: Element, key: K, vars?: Vars): void;
  lang(): Lang;
  /** Called after every language change (not on first load). */
  onChange(listener: (lang: Lang) => void): void;
}

function fill(template: string, vars: Vars | undefined): string {
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

function renderInline(target: Element, source: string): void {
  const nodes = parseInline(source).map((part): Node | string => {
    switch (part.kind) {
      case 'code':
        return h('code', {}, part.text);
      case 'strong':
        return h('strong', {}, part.text);
      case 'link':
        return h('a', isExternal(part.href) ? { href: part.href, rel: 'noopener' } : { href: part.href }, part.text);
      default:
        return part.text;
    }
  });
  target.replaceChildren(...nodes);
}

export function createI18n<K extends string>(dicts: Readonly<Record<Lang, Readonly<Record<K, string>>>>): I18n<K> {
  const { page } = parsePath(location.pathname);
  let current: Lang = parsePath(location.pathname).lang;
  const listeners: Array<(lang: Lang) => void> = [];
  const lookup = (key: string): string | undefined => (dicts[current] as Record<string, string>)[key];

  function translateDom(): void {
    for (const node of document.querySelectorAll('[data-i18n]')) {
      const value = lookup(node.getAttribute('data-i18n') ?? '');
      if (value === undefined) continue;
      if (node instanceof HTMLTitleElement) node.textContent = value;
      else renderInline(node, value);
    }
    for (const node of document.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of (node.getAttribute('data-i18n-attr') ?? '').split(';')) {
        const [attribute, key] = pair.split(':');
        const value = key === undefined ? undefined : lookup(key);
        if (attribute !== undefined && value !== undefined) node.setAttribute(attribute, value);
      }
    }
    document.documentElement.lang = current;
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-lang]')) {
      if (link.dataset['lang'] === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    // Internal links follow the language; the switch itself keeps its fixed targets.
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]:not([data-lang])')) {
      const href = link.getAttribute('href') ?? '';
      const localized = localizeHref(href, current);
      if (localized !== href) link.setAttribute('href', localized);
    }
  }

  function apply(next: Lang): void {
    if (next === current) return;
    current = next;
    translateDom();
    for (const listener of listeners) listener(current);
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || event.defaultPrevented) return;
    if (event instanceof MouseEvent && (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[data-lang]');
    const next = link?.dataset['lang'];
    if (!isLang(next)) return;
    event.preventDefault();
    try {
      localStorage.setItem(STORAGE.lang, next);
    } catch {
      // Storage unavailable: the URL still carries the choice.
    }
    if (next === current) return;
    history.pushState(null, '', `${pagePath(page, next)}${location.search}${location.hash}`);
    apply(next);
  });

  // Back / forward between the two language URLs of the same page.
  window.addEventListener('popstate', () => apply(parsePath(location.pathname).lang));

  return {
    t: (key, vars) => fill(dicts[current][key], vars),
    render: (target, key, vars) => renderInline(target, fill(dicts[current][key], vars)),
    lang: () => current,
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}
