/** Landing page: the demo console, use-case tabs and the live list of extra endpoints. */
import { initConsole } from '../console/index';
import { DEFAULT_URL } from '../console/markup';
import { loadSpec, shortName } from '../console/spec';
import type { common } from '../i18n/fr/common';
import type { consoleText } from '../i18n/fr/console';
import type { home } from '../i18n/fr/home';
import type { I18n } from '../i18n/runtime';
import { byId, h } from '../lib/dom';
import { initTablist, markSelected } from '../lib/tablist';
import { PAGES, localizeHref } from '../site/config';
import { iconNode } from '../site/icons';
import { initShared } from '../site/shared';
import { initImmersive } from './immersive';

type Key = keyof typeof common | keyof typeof home | keyof typeof consoleText;

function initUseCases(): void {
  const tabs = document.getElementById('usecases');
  if (tabs === null) return;
  initTablist(tabs, (tab) => {
    markSelected(tabs, tab);
    for (const other of tabs.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const panel = document.getElementById(other.getAttribute('aria-controls') ?? '');
      if (panel !== null) panel.hidden = other !== tab;
    }
  });
}

/**
 * Keeps the capability section true to the instance: when it comes into view
 * the live OpenAPI document is read, cards whose endpoint it does not list are
 * hidden, and endpoints that have no card yet are listed below.
 */
function initCapabilities(i18n: I18n<Key>): void {
  const section = document.getElementById('features');
  const box = document.getElementById('cap-more');
  if (section === null || box === null || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    void loadSpec()
      .then((spec) => {
        const offered = new Set(spec.operations.map((item) => item.path));
        const shown = new Set<string>(['/api/v1/openapi.json', '/health']);
        for (const card of section.querySelectorAll<HTMLElement>('[data-requires]')) {
          const path = card.dataset['requires'] ?? '';
          shown.add(path);
          card.hidden = !offered.has(path);
        }
        for (const group of section.querySelectorAll<HTMLElement>('.cap-group')) {
          group.hidden = group.querySelector('[data-requires]:not([hidden])') === null;
        }
        const extra = spec.operations.filter((item) => !shown.has(item.path));
        if (extra.length === 0) return;
        byId('cap-more-list').replaceChildren(
          ...extra.map((item) => {
            const query = item.params.some((entry) => entry.name === 'url') ? `?${new URLSearchParams({ url: DEFAULT_URL }).toString()}` : '';
            const href = `${localizeHref(PAGES.playground, i18n.lang())}?r=${encodeURIComponent(`${item.method} ${item.path}${query}`)}`;
            return h(
              'li',
              {},
              h('a', { class: 'more-card', href }, h('span', { class: 'tag' }, `${item.method} ${shortName(item)}`), h('span', { class: 'more-title', lang: 'en' }, item.summary === '' ? shortName(item) : item.summary), iconNode('arrowRight', 'size-4 shrink-0')),
            );
          }),
        );
        box.hidden = false;
      })
      .catch(() => undefined);
  }, { rootMargin: '200px' });
  observer.observe(section);
}

function initDates(i18n: I18n<Key>): void {
  const render = (): void => {
    const format = new Intl.DateTimeFormat(i18n.lang() === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long' });
    for (const time of document.querySelectorAll<HTMLTimeElement>('time[data-date]')) {
      const date = new Date(time.dateTime);
      if (!Number.isNaN(date.getTime())) time.textContent = format.format(date);
    }
  };
  render();
  i18n.onChange(render);
}

export function startHome(i18n: I18n<Key>): void {
  initShared(i18n);
  initConsole(i18n);
  initUseCases();
  initCapabilities(i18n);
  initDates(i18n);
  initImmersive();
}
