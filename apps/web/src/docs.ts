/** API reference page: language, real origin in the examples, in-page navigation. */
import './style.css';

import { EXAMPLE_ORIGIN } from './docs/spec';
import * as en from './i18n/en';
import * as fr from './i18n/fr';
import { createI18n } from './i18n/runtime';
import { initShared } from './site/shared';

const i18n = createI18n<keyof typeof fr.common | keyof typeof fr.docs>({
  fr: { ...fr.common, ...fr.docs },
  en: { ...en.common, ...en.docs },
});
initShared(i18n);

/**
 * The examples are built with a placeholder origin. Replace it with the origin
 * the page is served from, so every sample can be pasted and run as is.
 */
function useRealOrigin(): void {
  if (location.origin === EXAMPLE_ORIGIN) return;
  for (const block of document.querySelectorAll('.doc pre code')) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.nodeValue?.includes(EXAMPLE_ORIGIN) === true) {
        node.nodeValue = node.nodeValue.replaceAll(EXAMPLE_ORIGIN, location.origin);
      }
    }
  }
}

/** Highlights, in the navigation, the section currently being read. */
function initScrollSpy(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc-link')];
  const ids = [...new Set(links.map((link) => link.hash.slice(1)))];
  const headings = ids.flatMap((id) => {
    const heading = document.getElementById(id);
    return heading === null ? [] : [heading];
  });

  const mark = (id: string): void => {
    for (const link of links) {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  let scheduled = false;
  const update = (): void => {
    scheduled = false;
    // The current section is the last heading that scrolled above this line.
    const line = 140;
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= line) current = heading;
    }
    if (current !== undefined) mark(current.id);
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

/** On small screens the navigation is a disclosure: close it after a choice. */
function initMobileToc(): void {
  const details = document.getElementById('toc-mobile');
  if (!(details instanceof HTMLDetailsElement)) return;
  details.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a') !== null) details.open = false;
  });
}

useRealOrigin();
initScrollSpy();
initMobileToc();
