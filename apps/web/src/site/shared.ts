/**
 * Behaviour shared by every page: theme, header, top banner, language
 * selector, mobile menu, accessibility options, search and commands, keyboard
 * help, notifications, copy buttons, heading anchors, scroll reveal, tab
 * indicators and the offline fallback.
 */
import type { common } from '../i18n/fr/common';
import type { I18n } from '../i18n/runtime';
import { copyText, h } from '../lib/dom';
import { LOCALES, STORAGE, localizeHref } from './config';
import { iconNode, type IconName } from './icons';

type CommonKey = keyof typeof common;
type Theme = 'light' | 'dark';
type ThemeChoice = Theme | 'system';

const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/** True when the system or the visitor's own setting asks for less motion. */
export const reducedMotion = (): boolean => systemReduced.matches || root.classList.contains('reduce-motion');

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page view.
  }
}
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** How the last interaction was made: keyboard-driven changes are not animated. */
let lastInput: 'pointer' | 'keyboard' = 'pointer';
document.addEventListener('keydown', () => (lastInput = 'keyboard'), true);
document.addEventListener('pointerdown', () => (lastInput = 'pointer'), true);
export const fromKeyboard = (): boolean => lastInput === 'keyboard';

// ---- Notifications ------------------------------------------------------------

/** Shows a short message; the region is a live region, so it is also spoken. */
export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const region = document.getElementById('toasts');
  if (region === null) return;
  const item = h('div', { class: `toast toast-${kind}` }, iconNode(kind === 'error' ? 'alert' : 'check', 'size-4 shrink-0'), h('span', {}, message));
  region.append(item);
  window.setTimeout(() => {
    item.classList.add('toast-leave');
    window.setTimeout(() => item.remove(), 220);
  }, 3600);
}

// ---- Theme: light by default; dark or "follow the system" on request ------------------------------------

const THEME_COLOR: Readonly<Record<Theme, string>> = { light: '#ffffff', dark: '#0d1621' };
const themeListeners: Array<(theme: Theme) => void> = [];
const currentTheme = (): Theme => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
/** Light is the brand theme and the default. Dark and "follow the system" are explicit choices. */
const themeChoice = (): ThemeChoice => {
  const stored = read(STORAGE.theme);
  return stored === 'dark' || stored === 'system' ? stored : 'light';
};

function showTheme(theme: Theme): void {
  root.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle')?.setAttribute('aria-pressed', String(theme === 'dark'));
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', THEME_COLOR[theme]);
  const choice = themeChoice();
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="a11y-theme"]')) radio.checked = radio.value === choice;
  for (const listener of themeListeners) listener(theme);
}

function chooseTheme(choice: ThemeChoice): void {
  // Colours glide for the time of the switch only, so other transitions stay fast.
  root.classList.add('theme-transition');
  window.setTimeout(() => root.classList.remove('theme-transition'), 400);
  store(STORAGE.theme, choice);
  showTheme(choice === 'system' ? (systemDark.matches ? 'dark' : 'light') : choice);
}

export const toggleTheme = (): void => chooseTheme(currentTheme() === 'dark' ? 'light' : 'dark');

function initTheme(): void {
  showTheme(currentTheme());
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="a11y-theme"]')) {
    radio.addEventListener('change', () => {
      if (radio.checked) chooseTheme(radio.value as ThemeChoice);
    });
  }
  systemDark.addEventListener('change', (event) => {
    if (themeChoice() === 'system') showTheme(event.matches ? 'dark' : 'light');
  });
}

// ---- Scroll: header, progress bar, back to top ------------------------------------

function initScroll(menuOpen: () => boolean): void {
  const header = document.getElementById('site-header');
  const toTop = document.getElementById('to-top');
  let lastY = window.scrollY;
  let downStreak = 0;
  let ticking = false;
  const DELTA = 8;
  const TOP_ZONE = 96;

  const update = (): void => {
    ticking = false;
    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;

    if (header !== null) {
      header.dataset['scrolled'] = String(y > 8);
      if (y <= TOP_ZONE || menuOpen() || header.contains(document.activeElement)) {
        downStreak = 0;
        header.dataset['hidden'] = 'false';
      } else if (delta > DELTA) {
        // Two readings in a row: a single jump (anchor correction) must not hide it.
        downStreak += 1;
        if (downStreak >= 2) header.dataset['hidden'] = 'true';
      } else if (delta < -DELTA) {
        downStreak = 0;
        header.dataset['hidden'] = 'false';
      }
    }

    const scrollable = root.scrollHeight - window.innerHeight;
    root.style.setProperty('--progress', scrollable > 0 ? Math.min(1, y / scrollable).toFixed(4) : '0');

    if (toTop !== null) {
      const visible = y > 600;
      toTop.dataset['visible'] = String(visible);
      toTop.tabIndex = visible ? 0 : -1;
      toTop.setAttribute('aria-hidden', String(!visible));
    }
  };

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  // A focused control is never left under a hidden header.
  header?.addEventListener('focusin', () => {
    header.dataset['hidden'] = 'false';
  });
  toTop?.addEventListener('click', scrollToTop);
  update();
}

export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  // Focus goes back to the top too, or tabbing would resume mid-page.
  document.getElementById('main')?.focus({ preventScroll: true });
}

function initBanner(): void {
  document.getElementById('banner-close')?.addEventListener('click', () => {
    root.classList.add('no-banner');
    store(STORAGE.banner, 'closed');
    document.getElementById('site-header')?.querySelector<HTMLElement>('a, button')?.focus();
  });
}

// ---- Language selector (same contract as kayzen-lyon.com) -------------------------

function initLangSwitcher(): void {
  for (const box of document.querySelectorAll<HTMLElement>('[data-lang-switcher]')) {
    const trigger = box.querySelector<HTMLButtonElement>('button');
    const panel = box.querySelector<HTMLElement>('[role="menu"]');
    if (trigger === null || panel === null) continue;
    const items = (): HTMLElement[] => [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]')];

    const setOpen = (open: boolean, focusItem = false): void => {
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open && focusItem) (items().find((item) => item.hasAttribute('aria-current')) ?? items()[0])?.focus();
    };

    trigger.addEventListener('click', () => setOpen(panel.hidden !== false, fromKeyboard()));
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setOpen(true, true);
      }
    });
    box.addEventListener('keydown', (event) => {
      if (panel.hidden) return;
      if (event.key === 'Escape') {
        // Escape closes and gives focus back: a closed panel must not strand it.
        event.stopPropagation();
        setOpen(false);
        trigger.focus();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
      const list = items();
      if (list.length === 0) return;
      event.preventDefault();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : event.key === 'ArrowDown' ? at + 1 : at - 1;
      list[(next + list.length) % list.length]?.focus();
    });
    // Focus leaving the component closes it.
    box.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !box.contains(next)) setOpen(false);
    });
    // `mousedown`, not `click`: a click on a page link closes the panel before navigation.
    document.addEventListener('mousedown', (event) => {
      if (!panel.hidden && event.target instanceof Node && !box.contains(event.target)) setOpen(false);
    });
    panel.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('[role="menuitem"]') !== null) {
        setOpen(false);
        trigger.focus();
      }
    });
  }
}

// ---- Mobile menu: a modal panel ------------------------------------------------------

function initMenu(): () => boolean {
  const toggle = document.getElementById('menu-toggle');
  const panel = document.getElementById('mobile-menu');
  if (toggle === null || panel === null) return () => false;
  const isOpen = (): boolean => !panel.hidden;
  const focusables = (): HTMLElement[] => [toggle, ...panel.querySelectorAll<HTMLElement>('a[href], button')];

  const setOpen = (open: boolean, returnFocus = true): void => {
    if (open === isOpen()) return;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) panel.querySelector<HTMLElement>('a[href]')?.focus();
    else if (returnFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  panel.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a') !== null) setOpen(false, false);
  });
  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  // Closing by gesture: a horizontal swipe across the panel.
  let startX = 0;
  let startY = 0;
  panel.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    if (touch === undefined) return;
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });
  panel.addEventListener('touchend', (event) => {
    const touch = event.changedTouches[0];
    if (touch === undefined) return;
    if (Math.abs(touch.clientX - startX) > 90 && Math.abs(touch.clientY - startY) < 50) setOpen(false);
  }, { passive: true });
  // Leaving the phone layout closes it: the desktop navigation takes over.
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false, false);
  });
  return isOpen;
}

// ---- Accessibility options -------------------------------------------------------------

interface A11ySettings {
  fontSize: number;
  highContrast: boolean;
  legibleFont: boolean;
  oled: boolean;
  spacing: boolean;
  underline: boolean;
  motion: boolean;
  /** Single-key shortcuts ("/" and "?"). On by default; can be turned off (WCAG 2.1.4). */
  keys: boolean;
}

const A11Y_DEFAULTS: Readonly<A11ySettings> = {
  fontSize: 0,
  highContrast: false,
  legibleFont: false,
  oled: false,
  spacing: false,
  underline: false,
  motion: false,
  keys: true,
};
const FONT_SIZES = ['', '112%', '125%'] as const;
const SIZE_KEYS = ['a11y.size.0', 'a11y.size.1', 'a11y.size.2'] as const satisfies readonly CommonKey[];
/** Setting → class on <html>. Mirrored by the boot script, which applies them before paint. */
const A11Y_CLASSES = {
  highContrast: 'high-contrast',
  legibleFont: 'legible-font',
  oled: 'oled',
  spacing: 'wide-spacing',
  underline: 'underline-links',
  motion: 'reduce-motion',
} as const;

let a11y: A11ySettings = { ...A11Y_DEFAULTS };
const singleKeys = (): boolean => a11y.keys;

function readA11y(): A11ySettings {
  try {
    const parsed: unknown = JSON.parse(read(STORAGE.a11y) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return { ...A11Y_DEFAULTS };
    const raw = parsed as Partial<Record<keyof A11ySettings, unknown>>;
    const flag = (name: keyof A11ySettings): boolean => (typeof raw[name] === 'boolean' ? raw[name] : A11Y_DEFAULTS[name]) === true;
    return {
      fontSize: typeof raw.fontSize === 'number' ? Math.min(2, Math.max(0, Math.trunc(raw.fontSize))) : 0,
      highContrast: flag('highContrast'),
      legibleFont: flag('legibleFont'),
      oled: flag('oled'),
      spacing: flag('spacing'),
      underline: flag('underline'),
      motion: flag('motion'),
      keys: flag('keys'),
    };
  } catch {
    return { ...A11Y_DEFAULTS };
  }
}

function initA11y(i18n: I18n<CommonKey>): (open: boolean) => void {
  const dock = document.getElementById('a11y-dock');
  const toggle = document.getElementById('a11y-toggle');
  const panel = document.getElementById('a11y-panel');
  if (dock === null || toggle === null || panel === null) return () => undefined;

  const button = (id: string): HTMLButtonElement | null => document.getElementById(id) as HTMLButtonElement | null;
  const down = button('a11y-size-down');
  const up = button('a11y-size-up');
  const value = document.getElementById('a11y-size-value');
  const toggles: ReadonlyArray<readonly [HTMLButtonElement | null, keyof A11ySettings]> = [
    [button('a11y-contrast'), 'highContrast'],
    [button('a11y-font'), 'legibleFont'],
    [button('a11y-spacing'), 'spacing'],
    [button('a11y-underline'), 'underline'],
    [button('a11y-motion'), 'motion'],
    [button('a11y-keys'), 'keys'],
    [button('a11y-oled'), 'oled'],
  ];
  a11y = readA11y();

  const render = (): void => {
    root.style.fontSize = FONT_SIZES[a11y.fontSize] ?? '';
    for (const [setting, cls] of Object.entries(A11Y_CLASSES)) root.classList.toggle(cls, a11y[setting as keyof typeof A11Y_CLASSES]);
    if (down !== null) down.disabled = a11y.fontSize === 0;
    if (up !== null) up.disabled = a11y.fontSize === 2;
    const sizeKey = SIZE_KEYS[a11y.fontSize] ?? SIZE_KEYS[0];
    if (value !== null) {
      value.textContent = i18n.t(sizeKey);
      value.setAttribute('data-i18n', sizeKey);
    }
    // Pure black only exists in the dark theme: elsewhere the button would do nothing.
    const dark = currentTheme() === 'dark';
    for (const [element, setting] of toggles) {
      if (element === null) continue;
      const on = a11y[setting] === true && (setting !== 'oled' || dark);
      element.setAttribute('aria-pressed', String(on));
      if (setting === 'oled') element.disabled = !dark;
    }
  };
  const update = (patch: Partial<A11ySettings>): void => {
    a11y = { ...a11y, ...patch };
    store(STORAGE.a11y, JSON.stringify(a11y));
    render();
    window.dispatchEvent(new Event('resize')); // tab indicators re-measure
  };

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open && fromKeyboard()) panel.querySelector<HTMLElement>('input:checked, button')?.focus();
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden !== false));
  dock.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('mousedown', (event) => {
    if (!panel.hidden && event.target instanceof Node && !dock.contains(event.target)) setOpen(false);
  });

  down?.addEventListener('click', () => update({ fontSize: Math.max(0, a11y.fontSize - 1) }));
  up?.addEventListener('click', () => update({ fontSize: Math.min(2, a11y.fontSize + 1) }));
  for (const [element, setting] of toggles) {
    element?.addEventListener('click', () => update({ [setting]: a11y[setting] !== true }));
  }
  button('a11y-reset')?.addEventListener('click', () => update({ ...A11Y_DEFAULTS }));

  themeListeners.push(render);
  render();
  return setOpen;
}

// ---- Search and commands ------------------------------------------------------------

interface IndexEntry {
  /** p: page, d: documentation section. */
  readonly k: 'p' | 'd';
  /** Title. */
  readonly t: string;
  /** URL. */
  readonly u: string;
  /** Page the section belongs to. */
  readonly p?: string;
  /** Searchable text. */
  readonly x?: string;
}

interface Result {
  readonly group: CommonKey;
  readonly title: string;
  readonly detail?: string;
  readonly icon: IconName;
  readonly href?: string;
  readonly run?: () => void;
}

const fold = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function initSearch(i18n: I18n<CommonKey>, openA11y: (open: boolean) => void): () => void {
  const dialog = document.getElementById('search-dialog') as HTMLDialogElement | null;
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const list = document.getElementById('search-results');
  const count = document.getElementById('search-count');
  const keysDialog = document.getElementById('keys-dialog') as HTMLDialogElement | null;
  if (dialog === null || input === null || list === null) return () => undefined;

  const indexes = new Map<string, readonly IndexEntry[]>();
  let results: Result[] = [];
  let active = 0;

  async function index(): Promise<readonly IndexEntry[]> {
    const lang = i18n.lang();
    const cached = indexes.get(lang);
    if (cached !== undefined) return cached;
    try {
      const response = await fetch(`/search-index.${lang}.json`);
      const entries = (await response.json()) as IndexEntry[];
      indexes.set(lang, entries);
      return entries;
    } catch {
      return [];
    }
  }

  const actions = (): Result[] => [
    { group: 'search.actions', title: i18n.t('action.theme'), icon: 'moon', run: toggleTheme },
    ...LOCALES.filter((locale) => locale.code !== i18n.lang()).map(
      (locale): Result => ({ group: 'search.actions', title: locale.endonym, icon: 'type', run: () => i18n.switchTo(locale.code) }),
    ),
    { group: 'search.actions', title: i18n.t('action.shortcuts'), icon: 'keyboard', run: () => keysDialog?.showModal() },
    { group: 'search.actions', title: i18n.t('action.a11y'), icon: 'person', run: () => openA11y(true) },
    { group: 'search.actions', title: i18n.t('action.top'), icon: 'arrowUp', run: scrollToTop },
  ];

  function search(entries: readonly IndexEntry[], query: string): Result[] {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const toResult = (entry: IndexEntry): Result => ({
      group: entry.k === 'p' ? 'search.pages' : 'search.docs',
      title: entry.t,
      ...(entry.p === undefined ? {} : { detail: entry.p }),
      icon: entry.k === 'p' ? 'doc' : 'hash',
      href: entry.u,
    });
    if (words.length === 0) return [...entries.filter((entry) => entry.k === 'p').map(toResult), ...actions()];

    const scored: Array<readonly [number, Result]> = [];
    for (const entry of entries) {
      const title = fold(entry.t);
      const body = fold(`${entry.p ?? ''} ${entry.x ?? ''}`);
      let score = entry.k === 'p' ? 2 : 0;
      let matched = true;
      for (const word of words) {
        if (title.startsWith(word)) score += 8;
        else if (title.includes(word)) score += 5;
        else if (body.includes(word)) score += 1;
        else {
          matched = false;
          break;
        }
      }
      if (matched) scored.push([score, toResult(entry)]);
    }
    for (const action of actions()) {
      if (words.every((word) => fold(action.title).includes(word))) scored.push([4, action]);
    }
    return scored
      .sort((a, b) => b[0] - a[0])
      .slice(0, 24)
      .map(([, result]) => result);
  }

  function setActive(next: number): void {
    const options = [...list!.querySelectorAll<HTMLElement>('[role="option"]')];
    if (options.length === 0) {
      input!.removeAttribute('aria-activedescendant');
      return;
    }
    active = (next + options.length) % options.length;
    options.forEach((option, at) => option.setAttribute('aria-selected', String(at === active)));
    const current = options[active];
    if (current === undefined) return;
    input!.setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView({ block: 'nearest' });
  }

  function render(): void {
    const nodes: Node[] = [];
    let group: CommonKey | null = null;
    results.forEach((result, at) => {
      if (result.group !== group) {
        group = result.group;
        nodes.push(h('p', { class: 'search-group', role: 'presentation' }, i18n.t(group)));
      }
      const content = [
        iconNode(result.icon, 'size-4 shrink-0'),
        h('span', { class: 'min-w-0 flex-1' }, h('span', { class: 'search-title' }, result.title), result.detail === undefined ? null : h('span', { class: 'search-detail' }, result.detail)),
      ];
      const props = { class: 'search-option', role: 'option', id: `search-option-${at}`, 'aria-selected': 'false', tabindex: '-1' };
      const node = result.href === undefined ? h('button', { ...props, type: 'button' }, ...content) : h('a', { ...props, href: localizeHref(result.href, i18n.lang()) }, ...content);
      node.addEventListener('click', () => {
        dialog!.close();
        result.run?.();
      });
      node.addEventListener('mousemove', () => {
        if (active !== at) setActive(at);
      });
      nodes.push(node);
    });
    if (results.length === 0) nodes.push(h('p', { class: 'search-empty' }, i18n.t('search.empty')));
    list!.replaceChildren(...nodes);
    if (count !== null) count.textContent = input!.value.trim() === '' ? '' : i18n.t('search.results', { n: results.length });
    setActive(0);
  }

  async function refresh(): Promise<void> {
    const query = input!.value;
    const entries = await index();
    if (query !== input!.value) return; // a newer keystroke won
    results = search(entries, query);
    render();
  }

  function open(): void {
    if (dialog!.open) return;
    for (const other of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) other.close();
    input!.value = '';
    dialog!.showModal();
    input!.focus();
    void refresh();
  }

  input.addEventListener('input', () => void refresh());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      list.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.click();
    }
  });
  for (const trigger of document.querySelectorAll('[data-open-search]')) trigger.addEventListener('click', open);
  i18n.onChange(() => {
    if (dialog.open) void refresh();
  });
  return open;
}

function initDialogs(): void {
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog.overlay')) {
    // A click on the backdrop (the dialog element itself) closes it.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    for (const button of dialog.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => dialog.close());
  }
}

function initShortcuts(openSearch: () => void): void {
  const keysDialog = document.getElementById('keys-dialog') as HTMLDialogElement | null;
  // The platform's own modifier is shown on the search button.
  if (/Mac|iPhone|iPad/.test(navigator.platform)) {
    for (const kbd of document.querySelectorAll('.search-trigger kbd')) kbd.textContent = '⌘ K';
  }
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
      return;
    }
    if (!singleKeys() || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (typing || document.querySelector('dialog[open]') !== null) return;
    if (event.key === '/') {
      event.preventDefault();
      openSearch();
    } else if (event.key === '?') {
      event.preventDefault();
      keysDialog?.showModal();
    }
  });
}

// ---- Copy buttons, heading anchors, code line numbers ---------------------------------

function initCopyButtons(i18n: I18n<CommonKey>): void {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const lines = event.target.closest<HTMLButtonElement>('button[data-toggle-lines]');
    if (lines !== null) {
      const on = lines.closest('.code')?.classList.toggle('with-lines') ?? false;
      lines.setAttribute('aria-pressed', String(on));
      return;
    }
    const button = event.target.closest<HTMLButtonElement>('button[data-copy]');
    if (button === null) return;
    const source = document.querySelector(button.dataset['copy'] ?? '');
    if (source === null) return;
    const label = button.querySelector('[data-copy-label]');

    void copyText(source.textContent ?? '').then((ok) => {
      // Seen on the button, and spoken through the notification live region.
      toast(i18n.t(ok ? 'toast.copied' : 'toast.copyFailed'), ok ? 'info' : 'error');
      if (label === null) return;
      label.textContent = i18n.t(ok ? 'copied' : 'copyFailed');
      button.dataset['copied'] = String(ok);
      window.setTimeout(() => {
        label.textContent = i18n.t('copy');
        delete button.dataset['copied'];
      }, 1600);
    });
  });
}

function initAnchors(i18n: I18n<CommonKey>): void {
  for (const heading of document.querySelectorAll<HTMLElement>('.doc :is(h2, h3)[id], .guide :is(h2, h3)[id]')) {
    const button = h('button', { type: 'button', class: 'anchor-btn', 'data-i18n-attr': 'aria-label:anchor.copy', 'aria-label': i18n.t('anchor.copy') }, iconNode('link', 'size-4'));
    button.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}#${heading.id}`;
      history.replaceState(null, '', `#${heading.id}`);
      void copyText(url).then((ok) => toast(i18n.t(ok ? 'toast.linkCopied' : 'toast.copyFailed'), ok ? 'info' : 'error'));
    });
    heading.append(button);
  }
}

// ---- Scroll reveal and tab indicators ---------------------------------------------------

/**
 * Sections below the fold rise in as they arrive. The resting state is the
 * visible one: only elements that start outside the viewport are held back,
 * and nothing is held back when motion is reduced.
 */
function initReveal(): void {
  if (reducedMotion() || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove('reveal-pending');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const element of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
    if (element.getBoundingClientRect().top < window.innerHeight) continue;
    element.classList.add('reveal-pending');
    observer.observe(element);
  }
}

/** A marker that slides under the selected tab of every `.tabs` list. */
export function initTabIndicators(): void {
  for (const list of document.querySelectorAll<HTMLElement>('.tabs, .segmented')) {
    if (list.querySelector('.tab-indicator') !== null) continue;
    const marker = h('span', { class: 'tab-indicator', 'aria-hidden': 'true' });
    list.prepend(marker);
    const selected = (): HTMLElement | null =>
      list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
      list.querySelector<HTMLElement>('input:checked + span');
    const place = (): void => {
      const tab = selected();
      if (tab === null || tab.offsetWidth === 0) {
        marker.style.opacity = '0';
        return;
      }
      marker.style.opacity = '1';
      marker.classList.toggle('no-anim', fromKeyboard() || reducedMotion());
      marker.style.width = `${tab.offsetWidth}px`;
      marker.style.height = `${tab.offsetHeight}px`;
      marker.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
    };
    new MutationObserver(place).observe(list, { attributes: true, subtree: true, attributeFilter: ['aria-selected', 'hidden'] });
    list.addEventListener('change', place);
    window.addEventListener('resize', place);
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(list);
    list.classList.add('has-indicator');
    place();
  }
}

/** Offline fallback: a tiny service worker that only answers failed page loads. */
function initOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

export function initShared(i18n: I18n<CommonKey>): void {
  initTheme();
  initBanner();
  initLangSwitcher();
  initScroll(initMenu());
  const openA11y = initA11y(i18n);
  initDialogs();
  initShortcuts(initSearch(i18n, openA11y));
  initCopyButtons(i18n);
  initAnchors(i18n);
  initReveal();
  initTabIndicators();
  initOffline();
}
