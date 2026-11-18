/**
 * Behaviour shared by every page, ported from the KAYZEN site: theme button,
 * header that tucks away while scrolling down, mobile menu, accessibility
 * options, reading progress bar, back to top, copy buttons.
 */
import type { common } from '../i18n/fr';
import type { I18n } from '../i18n/runtime';
import { copyText } from '../lib/dom';
import { STORAGE } from './config';

type CommonKey = keyof typeof common;
type Theme = 'light' | 'dark';

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

const THEME_COLOR: Readonly<Record<Theme, string>> = { light: '#ffffff', dark: '#0d1621' };
const themeListeners: Array<(theme: Theme) => void> = [];
const currentTheme = (): Theme => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

function setTheme(theme: Theme): void {
  root.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle')?.setAttribute('aria-pressed', String(theme === 'dark'));
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', THEME_COLOR[theme]);
  }
  for (const listener of themeListeners) listener(theme);
}

function initTheme(): void {
  const toggle = document.getElementById('theme-toggle');
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  setTheme(currentTheme());

  toggle?.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    // Colours glide for the time of the switch only, so other transitions stay fast.
    root.classList.add('theme-transition');
    window.setTimeout(() => root.classList.remove('theme-transition'), 400);
    setTheme(next);
    store(STORAGE.theme, next);
  });
  // Without an explicit choice the site keeps following the system setting.
  system.addEventListener('change', (event) => {
    if (read(STORAGE.theme) === null) setTheme(event.matches ? 'dark' : 'light');
  });
}

/** One scroll listener, throttled to a frame, drives header, progress bar and back-to-top. */
function initScroll(menuOpen: () => boolean): void {
  const header = document.getElementById('site-header');
  const progress = document.getElementById('scroll-progress');
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
      const focusInside = header.contains(document.activeElement);
      if (y <= TOP_ZONE || menuOpen() || focusInside) {
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

    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    progress?.style.setProperty('--progress', scrollable > 0 ? String(Math.min(1, y / scrollable)) : '0');

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
  header?.addEventListener('focusin', () => {
    header.dataset['hidden'] = 'false';
  });
  toTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    // Focus goes back to the top too, or tabbing would resume mid-page.
    document.getElementById('main')?.focus({ preventScroll: true });
  });
  update();
}

/** The mobile menu is a modal dialog: focus is trapped, Escape closes it, focus returns to its button. */
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
  // Leaving the phone layout closes it: the desktop navigation takes over.
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false, false);
  });
  return isOpen;
}

interface A11ySettings {
  fontSize: number;
  highContrast: boolean;
  legibleFont: boolean;
  oled: boolean;
}

const A11Y_DEFAULTS: Readonly<A11ySettings> = { fontSize: 0, highContrast: false, legibleFont: false, oled: false };
const FONT_SIZES = ['', '112%', '125%'] as const;
const SIZE_KEYS = ['a11y.size.0', 'a11y.size.1', 'a11y.size.2'] as const satisfies readonly CommonKey[];

function readA11y(): A11ySettings {
  try {
    const parsed: unknown = JSON.parse(read(STORAGE.a11y) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return { ...A11Y_DEFAULTS };
    const raw = parsed as Partial<Record<keyof A11ySettings, unknown>>;
    const size = typeof raw.fontSize === 'number' ? Math.min(2, Math.max(0, Math.trunc(raw.fontSize))) : 0;
    return {
      fontSize: size,
      highContrast: raw.highContrast === true,
      legibleFont: raw.legibleFont === true,
      oled: raw.oled === true,
    };
  } catch {
    return { ...A11Y_DEFAULTS };
  }
}

function initA11y(i18n: I18n<CommonKey>): void {
  const dock = document.getElementById('a11y-dock');
  const toggle = document.getElementById('a11y-toggle');
  const panel = document.getElementById('a11y-panel');
  if (dock === null || toggle === null || panel === null) return;

  const button = (id: string): HTMLButtonElement | null => document.getElementById(id) as HTMLButtonElement | null;
  const down = button('a11y-size-down');
  const up = button('a11y-size-up');
  const value = document.getElementById('a11y-size-value');
  const contrast = button('a11y-contrast');
  const font = button('a11y-font');
  const oled = button('a11y-oled');
  let settings = readA11y();

  const render = (): void => {
    root.style.fontSize = FONT_SIZES[settings.fontSize] ?? '';
    root.classList.toggle('high-contrast', settings.highContrast);
    root.classList.toggle('legible-font', settings.legibleFont);
    root.classList.toggle('oled', settings.oled);

    if (down !== null) down.disabled = settings.fontSize === 0;
    if (up !== null) up.disabled = settings.fontSize === 2;
    const sizeKey = SIZE_KEYS[settings.fontSize] ?? SIZE_KEYS[0];
    if (value !== null) {
      value.textContent = i18n.t(sizeKey);
      value.setAttribute('data-i18n', sizeKey);
    }
    contrast?.setAttribute('aria-pressed', String(settings.highContrast));
    font?.setAttribute('aria-pressed', String(settings.legibleFont));
    // Pure black only exists in the dark theme: elsewhere the button would do nothing.
    const dark = currentTheme() === 'dark';
    if (oled !== null) {
      oled.disabled = !dark;
      oled.setAttribute('aria-pressed', String(settings.oled && dark));
    }
  };
  const update = (patch: Partial<A11ySettings>): void => {
    settings = { ...settings, ...patch };
    store(STORAGE.a11y, JSON.stringify(settings));
    render();
  };

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('mousedown', (event) => {
    if (!panel.hidden && event.target instanceof Node && !dock.contains(event.target)) setOpen(false);
  });

  down?.addEventListener('click', () => update({ fontSize: Math.max(0, settings.fontSize - 1) }));
  up?.addEventListener('click', () => update({ fontSize: Math.min(2, settings.fontSize + 1) }));
  contrast?.addEventListener('click', () => update({ highContrast: !settings.highContrast }));
  font?.addEventListener('click', () => update({ legibleFont: !settings.legibleFont }));
  oled?.addEventListener('click', () => update({ oled: !settings.oled }));
  button('a11y-reset')?.addEventListener('click', () => update({ ...A11Y_DEFAULTS }));

  themeListeners.push(render);
  render();
}

/**
 * Any `<button data-copy="#id">` copies the text of the element it points to.
 * Its label is swapped briefly so the result is both visible and announced.
 */
function initCopyButtons(i18n: I18n<CommonKey>): void {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button[data-copy]');
    if (button === null) return;
    const source = document.querySelector(button.dataset['copy'] ?? '');
    const label = button.querySelector('[data-copy-label]');
    if (source === null || label === null) return;

    void copyText(source.textContent ?? '').then((ok) => {
      label.textContent = i18n.t(ok ? 'copied' : 'copyFailed');
      window.setTimeout(() => {
        label.textContent = i18n.t('copy');
      }, 1600);
    });
  });
}

export function initShared(i18n: I18n<CommonKey>): void {
  initTheme();
  initScroll(initMenu());
  initA11y(i18n);
  initCopyButtons(i18n);
}
