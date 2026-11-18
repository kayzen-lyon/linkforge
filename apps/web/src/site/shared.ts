/** Behaviour shared by every page: theme toggle, mobile menu, copy buttons. */
import type { common } from '../i18n/fr';
import type { I18n } from '../i18n/runtime';
import { copyText } from '../lib/dom';

type CommonKey = keyof typeof common;

function initTheme(i18n: I18n<CommonKey>): void {
  const toggle = document.getElementById('theme-toggle');
  if (toggle === null) return;
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const current = (): 'light' | 'dark' => {
    const explicit = root.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return media.matches ? 'dark' : 'light';
  };
  const label = (): void => {
    const key: CommonKey = current() === 'dark' ? 'theme.toLight' : 'theme.toDark';
    toggle.setAttribute('aria-label', i18n.t(key));
    // Keeps the label right when the language changes later.
    toggle.setAttribute('data-i18n-attr', `aria-label:${key}`);
  };

  toggle.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    // Choosing what the OS already asks for goes back to "follow the system".
    const followsSystem = next === (media.matches ? 'dark' : 'light');
    if (followsSystem) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);
    try {
      if (followsSystem) localStorage.removeItem('lf-theme');
      else localStorage.setItem('lf-theme', next);
    } catch {
      // Storage unavailable (private mode…): the choice lasts for this page view.
    }
    label();
  });
  media.addEventListener('change', label);
  label();
}

function initMenu(): void {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle === null || nav === null) return;

  const setOpen = (open: boolean): void => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a') !== null) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
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
  initTheme(i18n);
  initMenu();
  initCopyButtons(i18n);
}
