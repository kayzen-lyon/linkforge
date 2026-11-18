/** Behaviour shared by every page: theme toggle, mobile menu, copy buttons. */
import { copyText } from '../lib/dom';

function initTheme(): void {
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
    toggle.setAttribute('aria-label', `Switch to ${current() === 'dark' ? 'light' : 'dark'} theme`);
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
      // Storage unavailable (private mode…): the choice simply lasts for this page view.
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
 * The button label is swapped briefly so the result is announced and visible.
 */
function initCopyButtons(): void {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button[data-copy]');
    if (button === null) return;
    const source = document.querySelector(button.dataset['copy'] ?? '');
    if (source === null) return;

    const label = button.querySelector('[data-copy-label]') ?? button;
    const original = button.dataset['copyOriginal'] ?? label.textContent ?? 'Copy';
    button.dataset['copyOriginal'] = original;
    void copyText(source.textContent ?? '').then((ok) => {
      label.textContent = ok ? 'Copied' : 'Copy failed';
      window.setTimeout(() => {
        label.textContent = original;
      }, 1600);
    });
  });
}

export function initShared(): void {
  initTheme();
  initMenu();
  initCopyButtons();
}
