/** Documentation pages (reference and guides): real origin in the examples, reading position, mobile contents. */
import { EXAMPLE_ORIGIN } from '../docs/spec';
import type { common } from '../i18n/fr/common';
import type { I18n } from '../i18n/runtime';
import { initShared } from '../site/shared';

/**
 * The examples are built with the production origin. On another instance,
 * replace it with the origin the page is served from, so every sample can be
 * pasted and run as is.
 */
function useRealOrigin(): void {
  if (location.origin === EXAMPLE_ORIGIN) return;
  for (const block of document.querySelectorAll('.doc pre code, .terminal pre code')) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.nodeValue?.includes(EXAMPLE_ORIGIN) === true) node.nodeValue = node.nodeValue.replaceAll(EXAMPLE_ORIGIN, location.origin);
    }
  }
}

/** Highlights, in the contents list, the section currently being read. */
function initScrollSpy(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc-link[href^="#"]')];
  const headings = [...new Set(links.map((link) => link.hash.slice(1)))].flatMap((id) => {
    const heading = document.getElementById(id);
    return heading === null ? [] : [heading];
  });
  if (headings.length === 0) return;

  let scheduled = false;
  const update = (): void => {
    scheduled = false;
    // The current section is the last heading that scrolled above this line.
    let current = headings[0];
    for (const heading of headings) if (heading.getBoundingClientRect().top <= 160) current = heading;
    for (const link of links) {
      if (current !== undefined && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };
  window.addEventListener(
    'scroll',
    () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}

/** On small screens the contents list is a disclosure: close it after a choice. */
function initMobileToc(): void {
  const details = document.getElementById('toc-mobile');
  if (!(details instanceof HTMLDetailsElement)) return;
  details.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a') !== null) details.open = false;
  });
}

export function startDocs(i18n: I18n<keyof typeof common>): void {
  initShared(i18n);
  useRealOrigin();
  initScrollSpy();
  initMobileToc();
  // Offline page: "try again" reloads the address the visitor wanted.
  for (const link of document.querySelectorAll('[data-reload]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      location.reload();
    });
  }
}
