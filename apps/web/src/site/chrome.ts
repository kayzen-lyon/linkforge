/**
 * Shared page chrome as HTML strings: top banner, header, mobile menu, footer
 * and the floating controls (accessibility options, back to top).
 *
 * Injected into every page at build time by the Vite plugin in
 * `vite.config.ts`. Text is not written here: elements carry `data-i18n`
 * keys that the plugin fills in the page's language and the client can
 * re-translate. Links are written for French; the plugin localises them.
 */
import type { common } from '../i18n/fr.ts';
import { BRAND, PAGES, PUBLISHER, REPO_URL, pagePath, type Lang, type PageId } from './config.ts';

type Key = keyof typeof common;

const attr = (pairs: Readonly<Record<string, Key>>): string =>
  `data-i18n-attr="${Object.entries(pairs)
    .map(([name, key]) => `${name}:${key}`)
    .join(';')}"`;
const text = (key: Key): string => `data-i18n="${key}"`;

const svg = (body: string, cls: string): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  sun: (cls: string) =>
    svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', cls),
  moon: (cls: string) => svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>', cls),
  menu: (cls: string) => svg('<path d="M4 7h16M4 12h16M4 17h16"/>', cls),
  close: (cls: string) => svg('<path d="M6 6l12 12M18 6 6 18"/>', cls),
  arrowRight: (cls: string) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', cls),
  arrowUp: (cls: string) => svg('<path d="M12 19V5M6 11l6-6 6 6"/>', cls),
  arrowUpRight: (cls: string) => svg('<path d="M7 17 17 7M9 7h8v8"/>', cls),
  chevron: (cls: string) => svg('<path d="m6 9 6 6 6-6"/>', cls),
  person: (cls: string) =>
    svg('<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5c4.5 1.4 9.5 1.4 14 0M12 10v5M12 15l-3.5 6M12 15l3.5 6"/>', cls),
  minus: (cls: string) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>', cls),
  plus: (cls: string) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>', cls),
  eye: (cls: string) =>
    svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', cls),
  type: (cls: string) => svg('<path d="M4 7V5h16v2M9 19h6M12 5v14"/>', cls),
} as const;

/** The mark is decorative next to the live-text name, hence the empty alt. */
const mark = (height: number): string =>
  `<img src="/logo-mark@1x.png" srcset="/logo-mark@1x.png 1x, /logo-mark@2x.png 2x, /logo-mark@3x.png 3x" alt="" width="${Math.round((height * 54) / 40)}" height="${height}" decoding="async" class="brand-mark" />`;

/** "Omnil" in ink, "link" in the brand orange, as in the artwork. One word for assistive tech. */
const wordmark = (cls: string): string =>
  `<span class="wordmark ${cls}" aria-hidden="true">Omnil<span>link</span></span><span class="sr-only">${BRAND}</span>`;

interface NavLink {
  readonly href: string;
  readonly key: Key;
  readonly page?: PageId;
}

const NAV: readonly NavLink[] = [
  { href: '/#demo', key: 'nav.demo' },
  { href: '/#features', key: 'nav.features' },
  { href: '/#examples', key: 'nav.examples' },
  { href: '/#self-host', key: 'nav.selfHost' },
  { href: PAGES.docs, key: 'nav.docs', page: 'docs' },
];

/** Real links to the same page in each language: crawlable, and they work without script. */
function langSwitch(page: PageId, lang: Lang): string {
  const link = (code: Lang, label: string, name: string): string =>
    `<a href="${pagePath(page, code)}" data-lang="${code}" lang="${code}" hreflang="${code}" aria-label="${name}"${code === lang ? ' aria-current="true"' : ''}>${label}</a>`;
  return `<div class="lang-switch" role="group" ${attr({ 'aria-label': 'lang.label' })}>
            ${link('fr', 'FR', 'Français')}
            ${link('en', 'EN', 'English')}
          </div>`;
}

export function header(page: PageId, lang: Lang): string {
  const current = (link: NavLink): string => (link.page === page ? ' aria-current="page"' : '');
  const desktop = NAV.map(
    (link) => `<a class="nav-link" href="${link.href}"${current(link)} ${text(link.key)}></a>`,
  ).join('\n          ');
  const mobile = NAV.map(
    (link) =>
      `<li><a class="menu-link" href="${link.href}"${current(link)}><span ${text(link.key)}></span>${ICONS.arrowRight('size-4 shrink-0')}</a></li>`,
  ).join('\n          ');

  return `<a class="skip-link" href="#main" ${text('skip')}></a>
    <aside class="top-banner" ${attr({ 'aria-label': 'banner.label' })}>
      <div class="mx-auto flex w-full max-w-7xl items-center justify-center gap-3 px-4 text-xs sm:px-6 md:text-sm">
        <span class="truncate"><span class="hidden sm:inline" ${text('banner.text')}></span><span class="sm:hidden" ${text('banner.short')}></span></span>
        <a class="banner-link" href="${REPO_URL}" rel="noopener"><span ${text('banner.link')}></span>${ICONS.arrowRight('size-3')}</a>
      </div>
    </aside>
    <div class="scroll-progress" id="scroll-progress" aria-hidden="true"></div>
    <header class="site-chrome" id="site-header">
      <nav class="mx-auto flex h-(--header-h) max-w-7xl items-center justify-between gap-3 px-4 sm:px-6" ${attr({ 'aria-label': 'nav.label' })}>
        <a href="/" class="brand" ${attr({ 'aria-label': 'brand.home' })}>${mark(40)}${wordmark('text-xl sm:text-[1.375rem]')}</a>
        <div class="hidden items-center gap-5 lg:flex xl:gap-6">
          ${desktop}
          <a class="btn btn-primary btn-compact hidden xl:inline-flex" href="/#demo"><span ${text('nav.cta')}></span>${ICONS.arrowRight('size-3.5')}</a>
        </div>
        <div class="flex items-center gap-1 sm:gap-2">
          ${langSwitch(page, lang)}
          <button type="button" id="theme-toggle" class="icon-btn" aria-pressed="false" ${attr({ 'aria-label': 'theme.dark' })}>${ICONS.moon('icon-moon size-5')}${ICONS.sun('icon-sun size-5')}</button>
          <button type="button" id="menu-toggle" class="icon-btn icon-btn-strong lg:hidden" aria-expanded="false" aria-controls="mobile-menu" ${attr({ 'aria-label': 'nav.menu' })}>${ICONS.menu('icon-menu size-6')}${ICONS.close('icon-close size-6')}</button>
        </div>
      </nav>
    </header>
    <div id="mobile-menu" class="mobile-menu" role="dialog" aria-modal="true" ${attr({ 'aria-label': 'menu.label' })} hidden>
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6">
        <p class="eyebrow" ${text('menu.eyebrow')}></p>
        <ul class="flex flex-col">
          ${mobile}
          <li><a class="menu-link" href="${REPO_URL}" rel="noopener"><span>GitHub</span>${ICONS.arrowUpRight('size-4 shrink-0')}</a></li>
        </ul>
        <a class="btn btn-primary" href="/#demo" ${text('nav.cta')}></a>
      </div>
    </div>`;
}

/** One-line location trail for inner pages. */
export function breadcrumb(titleKey: string): string {
  return `<nav class="crumbs" ${attr({ 'aria-label': 'crumb.label' })}>
          <ol>
            <li><a href="/" ${text('crumb.home')}></a></li>
            <li aria-current="page" data-i18n="${titleKey}"></li>
          </ol>
        </nav>`;
}

function floating(): string {
  const toggle = (id: string, key: Key, icon: string, extra = ''): string =>
    `<button type="button" id="${id}" class="a11y-option" aria-pressed="false"${extra}>${icon}<span class="text-left"><span ${text(key)}></span>${
      id === 'a11y-oled' ? `<span id="a11y-oled-hint" class="a11y-hint" ${text('a11y.oled.hint')}></span>` : ''
    }</span></button>`;

  return `<div class="a11y-dock" id="a11y-dock">
      <button type="button" id="a11y-toggle" class="a11y-toggle" aria-expanded="false" aria-controls="a11y-panel" ${attr({ 'aria-label': 'a11y.toggle' })}>${ICONS.person('size-5')}</button>
      <div id="a11y-panel" class="a11y-panel" role="group" ${attr({ 'aria-label': 'a11y.toggle' })} hidden>
        <p class="font-display text-sm font-bold text-foreground" ${text('a11y.title')}></p>
        <div class="flex flex-col gap-2">
          <p class="a11y-label" id="a11y-size-label" ${text('a11y.size')}></p>
          <div class="flex items-center gap-2" role="group" aria-labelledby="a11y-size-label">
            <button type="button" id="a11y-size-down" class="a11y-step" ${attr({ 'aria-label': 'a11y.size.down' })}>${ICONS.minus('size-4')}</button>
            <p id="a11y-size-value" class="flex-1 text-center text-sm font-semibold text-foreground" aria-live="polite" ${text('a11y.size.0')}></p>
            <button type="button" id="a11y-size-up" class="a11y-step" ${attr({ 'aria-label': 'a11y.size.up' })}>${ICONS.plus('size-4')}</button>
          </div>
        </div>
        ${toggle('a11y-contrast', 'a11y.contrast', ICONS.eye('size-4 shrink-0'))}
        ${toggle('a11y-font', 'a11y.font', ICONS.type('size-4 shrink-0'))}
        ${toggle('a11y-oled', 'a11y.oled', ICONS.moon('size-4 shrink-0'), ' aria-describedby="a11y-oled-hint"')}
        <button type="button" id="a11y-reset" class="a11y-reset" ${text('a11y.reset')}></button>
      </div>
    </div>
    <button type="button" id="to-top" class="to-top" tabindex="-1" aria-hidden="true" ${attr({ 'aria-label': 'top' })}>${ICONS.arrowUp('size-5')}</button>`;
}

export function footer(): string {
  const item = (href: string, key: Key, external = false): string =>
    `<li><a class="footer-link" href="${href}"${external ? ' rel="noopener"' : ''}><span class="link-grow" ${text(key)}></span></a></li>`;
  const column = (title: Key, items: string): string =>
    `<nav aria-labelledby="footer-${title}">
          <p class="footer-title" id="footer-${title}" ${text(title)}></p>
          <ul>${items}</ul>
        </nav>`;

  return `<footer class="site-footer">
      <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div class="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div class="lg:col-span-2">
            <a href="/" class="brand brand-on-dark mb-6" ${attr({ 'aria-label': 'brand.home' })}>${mark(40)}${wordmark('text-2xl')}</a>
            <p class="mb-6 max-w-xs text-sm leading-relaxed text-white/75" ${text('footer.tagline')}></p>
            <p class="footer-chip" ${text('footer.chip')}></p>
            <p class="mt-6 max-w-xs text-xs text-white/75" ${text('footer.notrack')}></p>
          </div>
          ${column('footer.product', [item('/#demo', 'footer.demo'), item('/#features', 'footer.features'), item('/#examples', 'footer.examples'), item('/#self-host', 'footer.selfHost'), item('/#faq', 'footer.faq')].join(''))}
          ${column('footer.developers', [item(PAGES.docs, 'footer.docs'), item('/api/v1/openapi.json', 'footer.openapi'), item('/health', 'footer.health'), item(REPO_URL, 'footer.source', true)].join(''))}
          ${column('footer.info', [item(PAGES.accessibility, 'footer.accessibility'), item(PAGES.legal, 'footer.legal')].join(''))}
        </div>
        <div class="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/15 pt-8 text-xs text-white/80 md:flex-row md:items-center">
          <p ${text('footer.license')}></p>
          <p class="footer-credit" data-publisher="${PUBLISHER}" ${text('footer.credit')}></p>
        </div>
      </div>
    </footer>
    ${floating()}`;
}
