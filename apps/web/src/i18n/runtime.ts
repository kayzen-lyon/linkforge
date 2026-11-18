/**
 * Client-side language switching.
 *
 * The HTML ships in French (filled in at build time). Elements carry
 * `data-i18n="key"` for their content and `data-i18n-attr="attr:key;…"` for
 * attributes; switching language re-renders them in place, without a reload.
 * The choice is stored, mirrored in `<html lang>` and in `?lang=` so a
 * language can be linked.
 */
import { h } from '../lib/dom';
import { isExternal, parseInline } from '../lib/inline';

export type Lang = 'fr' | 'en';
export type Vars = Readonly<Record<string, string | number>>;

const STORAGE_KEY = 'lf-lang';
const isLang = (value: unknown): value is Lang => value === 'fr' || value === 'en';

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
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
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

function readStored(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

export function createI18n<K extends string>(dicts: Readonly<Record<Lang, Readonly<Record<K, string>>>>): I18n<K> {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  const stored = readStored();
  let current: Lang = isLang(fromUrl) ? fromUrl : (stored ?? 'fr');
  // Once a language was chosen (by link or by switch) it travels in the URL.
  let explicit = isLang(fromUrl) || stored !== null;
  const listeners: Array<(lang: Lang) => void> = [];

  const lookup = (key: string): string | undefined => (dicts[current] as Record<string, string>)[key];

  function translateDom(): void {
    for (const node of document.querySelectorAll('[data-i18n]')) {
      const text = lookup(node.getAttribute('data-i18n') ?? '');
      if (text !== undefined) renderInline(node, text);
    }
    for (const node of document.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of (node.getAttribute('data-i18n-attr') ?? '').split(';')) {
        const [attr, key] = pair.split(':');
        const text = key === undefined ? undefined : lookup(key);
        if (attr !== undefined && text !== undefined) node.setAttribute(attr, text);
      }
    }
  }

  /** Keeps `<html lang>`, the switcher, the address bar and internal links in step. */
  function syncChrome(): void {
    document.documentElement.lang = current;
    for (const button of document.querySelectorAll<HTMLElement>('[data-lang]')) {
      button.setAttribute('aria-pressed', String(button.dataset['lang'] === current));
    }
    if (!explicit) return;

    const url = new URL(location.href);
    if (url.searchParams.get('lang') !== current) {
      url.searchParams.set('lang', current);
      history.replaceState(history.state, '', url);
    }
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
      const target = new URL(link.href);
      if (target.pathname.startsWith('/api/') || target.pathname === '/health') continue;
      target.searchParams.set('lang', current);
      link.setAttribute('href', `${target.pathname}${target.search}${target.hash}`);
    }
  }

  function setLang(next: Lang): void {
    explicit = true;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the URL still carries the choice.
    }
    const changed = next !== current;
    current = next;
    if (changed) translateDom();
    syncChrome();
    if (changed) for (const listener of listeners) listener(current);
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>('[data-lang]');
    const next = button?.dataset['lang'];
    if (isLang(next)) setLang(next);
  });

  // The markup is French already: only translate on load for another language.
  if (current !== 'fr') translateDom();
  syncChrome();
  document.documentElement.classList.remove('i18n-pending');

  return {
    t: (key, vars) => fill(dicts[current][key], vars),
    render: (target, key, vars) => renderInline(target, fill(dicts[current][key], vars)),
    lang: () => current,
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}
