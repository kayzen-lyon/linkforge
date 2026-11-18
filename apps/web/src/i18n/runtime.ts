/**
 * Client-side language handling.
 *
 * Every page is built once per language (French at the root, other languages
 * under their prefix), so the HTML a visitor or a crawler receives is already
 * in the language of its URL, and each page script ships only that language.
 *
 * On interactive pages the language selector then switches in place: the
 * other dictionary is fetched on demand, the page is re-rendered and the
 * address moves to the other URL with `pushState`, so no state is lost (a
 * playground result stays on screen). Pages whose content is static prose
 * simply navigate to their other-language URL.
 *
 * Elements carry `data-i18n="key"` for content and
 * `data-i18n-attr="attr:key;…"` for attributes.
 */
import { h } from '../lib/dom';
import { isExternal, parseInline } from '../lib/inline';
import { STORAGE, isLang, localeOf, localizeHref, pagePath, parsePath, type Lang } from '../site/config';

export type { Lang };
export type Vars = Readonly<Record<string, string | number>>;
export type Dictionary<K extends string> = Readonly<Record<K, string>>;

export interface I18n<K extends string> {
  /** Plain-text translation, with `{name}` placeholders replaced. */
  t(key: K, vars?: Vars): string;
  /** Whether `key` exists in the dictionary (for keys built at run time). */
  has(key: string): boolean;
  /** Renders a translation with its inline markup into `target`. */
  render(target: Element, key: K, vars?: Vars): void;
  lang(): Lang;
  /** Switches language as the selector would (used by the command palette). */
  switchTo(lang: Lang): void;
  /** Called after every in-place language change (not on first load). */
  onChange(listener: (lang: Lang) => void): void;
}

export interface I18nOptions<K extends string> {
  /** Dictionary of the language the page was built in. */
  readonly dict: Dictionary<K>;
  /** Loaders for the other languages. Without them the selector navigates. */
  readonly load?: Partial<Record<Lang, () => Promise<Dictionary<K>>>>;
}

function fill(template: string, vars: Vars | undefined): string {
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function renderInline(target: Element, source: string): void {
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

export function createI18n<K extends string>(options: I18nOptions<K>): I18n<K> {
  const { page, lang: initial } = parsePath(location.pathname);
  let current: Lang = initial;
  const dicts: Partial<Record<Lang, Dictionary<K>>> = { [initial]: options.dict };
  const listeners: Array<(lang: Lang) => void> = [];
  const dict = (): Dictionary<K> => dicts[current] ?? options.dict;

  function translateDom(): void {
    const table = dict() as Readonly<Record<string, string>>;
    for (const node of document.querySelectorAll('[data-i18n]')) {
      const value = table[node.getAttribute('data-i18n') ?? ''];
      if (value === undefined) continue;
      if (node instanceof HTMLTitleElement) node.textContent = value;
      else renderInline(node, value);
    }
    for (const node of document.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of (node.getAttribute('data-i18n-attr') ?? '').split(';')) {
        const [attribute, key] = pair.split(':');
        const value = key === undefined ? undefined : table[key];
        if (attribute !== undefined && value !== undefined) node.setAttribute(attribute, value);
      }
    }
    const locale = localeOf(current);
    document.documentElement.lang = current;
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-lang]')) {
      if (link.dataset['lang'] === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    for (const image of document.querySelectorAll<HTMLImageElement>('[data-lang-flag]')) image.src = `/flags/${locale.flag}.svg`;
    for (const name of document.querySelectorAll<HTMLElement>('[data-lang-name]')) {
      name.textContent = locale.endonym;
      name.lang = current;
    }
    // Internal links follow the language; the selector itself keeps its fixed targets.
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]:not([data-lang])')) {
      const href = link.getAttribute('href') ?? '';
      const localized = localizeHref(href, current);
      if (localized !== href) link.setAttribute('href', localized);
    }
  }

  async function apply(next: Lang): Promise<boolean> {
    if (next === current) return true;
    if (dicts[next] === undefined) {
      const loader = options.load?.[next];
      if (loader === undefined) return false;
      try {
        dicts[next] = await loader();
      } catch {
        return false;
      }
    }
    current = next;
    translateDom();
    for (const listener of listeners) listener(current);
    return true;
  }

  const remember = (lang: Lang): void => {
    try {
      localStorage.setItem(STORAGE.lang, lang);
    } catch {
      // Storage unavailable: the URL still carries the choice.
    }
  };
  const target = (lang: Lang): string => `${pagePath(page, lang)}${location.search}${location.hash}`;

  function switchTo(next: Lang): void {
    remember(next);
    if (next === current) return;
    void apply(next).then((done) => {
      if (done) history.pushState(null, '', target(next));
      else location.assign(target(next));
    });
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || event.defaultPrevented) return;
    if (event instanceof MouseEvent && (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)) return;
    const next = event.target.closest<HTMLAnchorElement>('a[data-lang]')?.dataset['lang'];
    if (!isLang(next)) return;
    remember(next);
    // Static pages (no loader) let the link navigate to the other URL.
    if (options.load?.[next] === undefined && next !== current) return;
    event.preventDefault();
    switchTo(next);
  });

  // Back / forward between the language URLs of the same page.
  window.addEventListener('popstate', () => {
    const { lang } = parsePath(location.pathname);
    void apply(lang).then((done) => {
      if (!done) location.reload();
    });
  });

  return {
    t: (key, vars) => fill(dict()[key], vars),
    has: (key) => key in dict(),
    render: (target_, key, vars) => renderInline(target_, fill(dict()[key], vars)),
    lang: () => current,
    switchTo,
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}
