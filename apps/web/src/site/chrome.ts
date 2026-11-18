/**
 * Shared page chrome as HTML strings: top banner, header, language selector,
 * mobile menu, footer, floating controls and the overlay shells (search and
 * commands, keyboard help, notifications).
 *
 * Injected into every page at build time by the Vite plugin. Text is not
 * written here: elements carry `data-i18n` keys that the plugin fills in the
 * page's language and the client can re-translate. Links are written for
 * French; the plugin localises them.
 */
import type { common } from '../i18n/fr/common.ts';
import { BRAND, LOCALES, PAGES, PUBLISHER, PUBLISHER_URL, REPO_URL, localeOf, pagePath, type Lang, type PageId } from './config.ts';
import { icon } from './icons.ts';

type Key = keyof typeof common;

export const attr = (pairs: Readonly<Record<string, Key>>): string =>
  `data-i18n-attr="${Object.entries(pairs)
    .map(([name, key]) => `${name}:${key}`)
    .join(';')}"`;
const text = (key: Key): string => `data-i18n="${key}"`;

/**
 * The mark is decorative next to the live-text name, hence the empty alt.
 * Two files: the navy half of the artwork disappears on a dark header, so the
 * dark theme shows a variant with that half lifted (CSS picks one).
 */
function mark(height: number, onDark = false): string {
  const width = Math.round((height * 61) / 40);
  const image = (variant: string, cls: string, lazy: boolean): string =>
    `<img src="/logo-mark${variant}@1x.webp" srcset="/logo-mark${variant}@1x.webp 1x, /logo-mark${variant}@2x.webp 2x, /logo-mark${variant}@3x.webp 3x" alt="" width="${width}" height="${height}" decoding="async"${lazy ? ' loading="lazy"' : ''} class="brand-mark ${cls}" />`;
  return onDark ? image('-dark', '', true) : `${image('', 'mark-light', false)}${image('-dark', 'mark-dark', true)}`;
}

/** "Omnil" in ink, "link" in the brand orange, as in the artwork. One word for assistive tech. */
const wordmark = (cls: string): string =>
  `<span class="wordmark ${cls}" aria-hidden="true">Omnil<span>link</span></span><span class="sr-only">${BRAND}</span>`;

const flag = (code: string, lazy: boolean, extra = ''): string =>
  `<img src="/flags/${code}.svg" alt="" width="22" height="16" class="flag"${lazy ? ' loading="lazy"' : ''}${extra} />`;

interface NavLink {
  readonly href: string;
  readonly key: Key;
  readonly pages: readonly PageId[];
}

const NAV: readonly NavLink[] = [
  { href: PAGES.playground, key: 'nav.playground', pages: ['playground'] },
  { href: '/#features', key: 'nav.features', pages: [] },
  { href: PAGES.quickstart, key: 'nav.guides', pages: ['quickstart', 'self-hosting', 'sdk', 'ai-agents', 'recipes', 'errors', 'limits', 'security', 'glossary', 'changelog'] },
  { href: PAGES.docs, key: 'nav.docs', pages: ['docs'] },
  { href: PAGES.status, key: 'nav.status', pages: ['status'] },
];

/** One entry per language: a real link to the same page in that language. */
function langItems(page: PageId, lang: Lang, cls: string, role: string): string {
  return LOCALES.map(
    (locale) =>
      `<a${role} class="${cls}" href="${pagePath(page, locale.code)}" data-lang="${locale.code}" lang="${locale.code}" hreflang="${locale.code}"${locale.code === lang ? ' aria-current="true"' : ''}>${flag(locale.flag, true)}<span class="flex-1">${locale.endonym}</span>${icon('check', 'lang-check size-4 shrink-0')}</a>`,
  ).join('\n              ');
}

/**
 * Language selector, as on kayzen-lyon.com: the flag alone is the trigger and
 * opens a panel of endonyms with a check mark on the current language. A flag
 * never names a language, so it is decorative and the button's accessible name
 * states the current language in words.
 */
function langSwitcher(page: PageId, lang: Lang): string {
  const current = localeOf(lang);
  return `<div class="lang" data-lang-switcher>
            <button type="button" class="icon-btn" aria-haspopup="menu" aria-expanded="false" aria-labelledby="lang-label lang-name">
              <span id="lang-label" class="sr-only" ${text('lang.current')}></span>
              <span id="lang-name" class="sr-only" lang="${current.code}" data-lang-name>${current.endonym}</span>
              ${flag(current.flag, false, ' data-lang-flag')}
            </button>
            <div class="lang-panel" role="menu" ${attr({ 'aria-label': 'lang.menu' })} hidden>
              ${langItems(page, lang, 'lang-item', ' role="menuitem"')}
            </div>
          </div>`;
}

export function header(page: PageId, lang: Lang): string {
  const current = (link: NavLink): string => (link.pages.includes(page) ? ' aria-current="page"' : '');
  const desktop = NAV.map((link) => `<a class="nav-link" href="${link.href}"${current(link)} ${text(link.key)}></a>`).join(
    '\n          ',
  );
  const mobile = NAV.map(
    (link) =>
      `<li><a class="menu-link" href="${link.href}"${current(link)}><span ${text(link.key)}></span>${icon('arrowRight', 'size-4 shrink-0')}</a></li>`,
  ).join('\n          ');

  return `<a class="skip-link" href="#main" ${text('skip')}></a>
    <aside class="top-banner" id="top-banner" ${attr({ 'aria-label': 'banner.label' })}>
      <div class="mx-auto flex w-full max-w-7xl items-center justify-center gap-3 px-11 text-xs sm:px-12 md:text-sm">
        <span class="truncate"><span class="hidden sm:inline" ${text('banner.text')}></span><span class="sm:hidden" ${text('banner.short')}></span></span>
        <a class="banner-link" href="${REPO_URL}" rel="noopener"><span ${text('banner.link')}></span>${icon('arrowRight', 'size-3')}</a>
      </div>
      <button type="button" class="banner-close" id="banner-close" ${attr({ 'aria-label': 'banner.close' })}>${icon('close', 'size-4')}</button>
    </aside>
    <div class="scroll-progress" id="scroll-progress" aria-hidden="true"></div>
    <header class="site-chrome" id="site-header">
      <nav class="mx-auto flex h-(--header-h) max-w-7xl items-center justify-between gap-3 px-4 transition-[height] duration-300 sm:px-6" ${attr({ 'aria-label': 'nav.label' })}>
        <a href="/" class="brand" ${attr({ 'aria-label': 'brand.home' })}>${mark(40)}${wordmark('text-xl sm:text-[1.375rem]')}</a>
        <div class="hidden items-center gap-5 lg:flex xl:gap-6">
          ${desktop}
        </div>
        <div class="flex items-center gap-0.5 sm:gap-1.5">
          <button type="button" class="search-trigger" data-open-search aria-haspopup="dialog">
            ${icon('search', 'size-5 xl:size-4')}<span class="hidden xl:inline" ${text('search.open')}></span><kbd class="hidden xl:inline-flex" aria-hidden="true">Ctrl K</kbd><span class="sr-only xl:hidden" ${text('search.open')}></span>
          </button>
          ${langSwitcher(page, lang)}
          <button type="button" id="theme-toggle" class="icon-btn" aria-pressed="false" ${attr({ 'aria-label': 'theme.dark' })}>${icon('moon', 'icon-moon size-5')}${icon('sun', 'icon-sun size-5')}</button>
          <button type="button" id="menu-toggle" class="icon-btn icon-btn-strong lg:hidden" aria-expanded="false" aria-controls="mobile-menu" ${attr({ 'aria-label': 'nav.menu' })}>${icon('menu', 'icon-menu size-6')}${icon('close', 'icon-close size-6')}</button>
        </div>
      </nav>
    </header>
    <div id="mobile-menu" class="mobile-menu" role="dialog" aria-modal="true" ${attr({ 'aria-label': 'menu.label' })} hidden>
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6">
        <p class="eyebrow" ${text('menu.eyebrow')}></p>
        <ul class="flex flex-col">
          ${mobile}
          <li><a class="menu-link" href="${REPO_URL}" rel="noopener"><span>GitHub</span>${icon('arrowUpRight', 'size-4 shrink-0')}</a></li>
        </ul>
        <div class="flex flex-col gap-2">
          <p class="eyebrow" ${text('lang.menu')}></p>
          <div class="grid grid-cols-2 gap-2">
            ${langItems(page, lang, 'lang-item lang-item-card', '')}
          </div>
        </div>
        <a class="btn btn-primary" href="${PAGES.playground}" ${text('nav.cta')}></a>
      </div>
    </div>`;
}

/** One-line location trail for inner pages. `trail` lists intermediate pages. */
export function breadcrumb(titleKey: string, trail: ReadonlyArray<readonly [string, Key]> = []): string {
  const middle = trail.map(([href, key]) => `<li><a href="${href}" ${text(key)}></a></li>`).join('');
  return `<nav class="crumbs" ${attr({ 'aria-label': 'crumb.label' })}>
          <ol>
            <li><a href="/" ${text('crumb.home')}></a></li>${middle}
            <li aria-current="page" data-i18n="${titleKey}"></li>
          </ol>
        </nav>`;
}

function a11yPanel(): string {
  const toggle = (id: string, key: Key, name: Parameters<typeof icon>[0], inner = ''): string =>
    `<button type="button" id="${id}" class="a11y-option" aria-pressed="false">${icon(name, 'size-4 shrink-0')}<span class="text-left"><span ${text(key)}></span>${inner}</span></button>`;
  const theme = (value: string, key: Key, name: Parameters<typeof icon>[0]): string =>
    `<label><input type="radio" name="a11y-theme" value="${value}" /><span>${icon(name, 'size-4')}<span ${text(key)}></span></span></label>`;

  return `<div class="a11y-dock" id="a11y-dock">
      <button type="button" id="a11y-toggle" class="a11y-toggle" aria-expanded="false" aria-controls="a11y-panel" ${attr({ 'aria-label': 'a11y.toggle' })}>${icon('person', 'size-5')}</button>
      <div id="a11y-panel" class="a11y-panel" role="group" ${attr({ 'aria-label': 'a11y.toggle' })} hidden>
        <p class="font-display text-sm font-bold text-foreground" ${text('a11y.title')}></p>
        <fieldset class="flex flex-col gap-2">
          <legend class="a11y-label" ${text('a11y.theme')}></legend>
          <div class="segmented segmented-fill">
            ${theme('light', 'theme.light', 'sun')}
            ${theme('dark', 'theme.darkShort', 'moon')}
            ${theme('system', 'theme.system', 'monitor')}
          </div>
        </fieldset>
        <div class="flex flex-col gap-2">
          <p class="a11y-label" id="a11y-size-label" ${text('a11y.size')}></p>
          <div class="flex items-center gap-2" role="group" aria-labelledby="a11y-size-label">
            <button type="button" id="a11y-size-down" class="a11y-step" ${attr({ 'aria-label': 'a11y.size.down' })}>${icon('minus', 'size-4')}</button>
            <p id="a11y-size-value" class="flex-1 text-center text-sm font-semibold text-foreground" aria-live="polite" ${text('a11y.size.0')}></p>
            <button type="button" id="a11y-size-up" class="a11y-step" ${attr({ 'aria-label': 'a11y.size.up' })}>${icon('plus', 'size-4')}</button>
          </div>
        </div>
        <div class="grid gap-2">
          ${toggle('a11y-contrast', 'a11y.contrast', 'eye')}
          ${toggle('a11y-font', 'a11y.font', 'type')}
          ${toggle('a11y-spacing', 'a11y.spacing', 'rows')}
          ${toggle('a11y-underline', 'a11y.underline', 'underline')}
          ${toggle('a11y-motion', 'a11y.motion', 'pause')}
          ${toggle('a11y-keys', 'a11y.keys', 'keyboard')}
          ${toggle('a11y-oled', 'a11y.oled', 'moon', `<span id="a11y-oled-hint" class="a11y-hint" ${text('a11y.oled.hint')}></span>`)}
        </div>
        <a class="a11y-reset" href="${PAGES.accessibility}" ${text('a11y.statement')}></a>
        <button type="button" id="a11y-reset" class="a11y-reset" ${text('a11y.reset')}></button>
      </div>
    </div>
    <button type="button" id="to-top" class="to-top" tabindex="-1" aria-hidden="true" ${attr({ 'aria-label': 'top' })}>
      <svg class="to-top-ring" viewBox="0 0 44 44" aria-hidden="true" focusable="false"><circle class="track" cx="22" cy="22" r="20" /><circle class="bar" cx="22" cy="22" r="20" pathLength="100" /></svg>
      ${icon('arrowUp', 'size-5')}
    </button>`;
}

/** Dialog shells; their content is built by the client when they first open. */
function overlays(): string {
  const key = (label: string): string => `<kbd>${label}</kbd>`;
  const row = (keys: string, k: Key): string => `<div><dt>${keys}</dt><dd ${text(k)}></dd></div>`;
  const or = `<span class="px-1" ${text('keys.or')}></span>`;
  return `<dialog id="search-dialog" class="overlay overlay-top" ${attr({ 'aria-label': 'search.label' })}>
      <div class="search-box">
        <div class="search-field">
          ${icon('search', 'size-5 shrink-0')}
          <input id="search-input" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list" ${attr({ 'aria-label': 'search.label', placeholder: 'search.placeholder' })} />
          <button type="button" class="icon-btn" data-close-dialog ${attr({ 'aria-label': 'close' })}>${icon('close', 'size-5')}</button>
        </div>
        <div id="search-results" class="search-results" role="listbox" ${attr({ 'aria-label': 'search.label' })}></div>
        <p class="search-foot"><span ${text('search.hint')}></span><span id="search-count" role="status"></span></p>
      </div>
    </dialog>
    <dialog id="keys-dialog" class="overlay" aria-labelledby="keys-title">
      <div class="keys-box">
        <div class="flex items-center justify-between gap-4">
          <h2 id="keys-title" class="text-xl!" ${text('keys.title')}></h2>
          <button type="button" class="icon-btn" data-close-dialog ${attr({ 'aria-label': 'close' })}>${icon('close', 'size-5')}</button>
        </div>
        <dl class="keys-list">
          ${row(`${key('Ctrl')}${key('K')}${or}${key('/')}`, 'keys.search')}
          ${row(key('?'), 'keys.help')}
          ${row(`${key('←')}${key('→')}`, 'keys.tabs')}
          ${row(`${key('Ctrl')}${key('↵')}`, 'keys.run')}
          ${row(key('Esc'), 'keys.escape')}
        </dl>
        <p class="text-sm text-muted-foreground" ${text('keys.note')}></p>
      </div>
    </dialog>
    <div id="toasts" class="toasts" role="status" aria-live="polite" ${attr({ 'aria-label': 'toast.label' })}></div>`;
}

export function footer(): string {
  const item = (href: string, key: Key, external = false): string =>
    `<li><a class="footer-link" href="${href}"${external ? ' rel="noopener"' : ''}><span class="link-grow" ${text(key)}></span></a></li>`;
  const column = (title: Key, items: string[]): string =>
    `<nav aria-labelledby="footer-${title}">
          <p class="footer-title" id="footer-${title}" ${text(title)}></p>
          <ul>${items.join('')}</ul>
        </nav>`;

  return `<footer class="site-footer">
      <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div class="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div class="lg:col-span-2">
            <a href="/" class="brand brand-on-dark mb-6" ${attr({ 'aria-label': 'brand.home' })}>${mark(40, true)}${wordmark('text-2xl')}</a>
            <p class="mb-6 max-w-xs text-sm leading-relaxed text-white/75" ${text('footer.tagline')}></p>
            <p class="footer-chip" ${text('footer.chip')}></p>
            <p class="mt-6 max-w-xs text-xs text-white/75" ${text('footer.notrack')}></p>
          </div>
          ${column('footer.product', [item(PAGES.playground, 'footer.playground'), item('/#features', 'footer.features'), item('/#examples', 'footer.examples'), item('/#self-host', 'footer.selfHost'), item('/#faq', 'footer.faq')])}
          ${column('footer.developers', [item(PAGES.quickstart, 'footer.quickstart'), item(PAGES.docs, 'footer.docs'), item('/api/v1/openapi.json', 'footer.openapi'), item(PAGES.glossary, 'footer.glossary'), item(REPO_URL, 'footer.source', true)])}
          ${column('footer.info', [item(PAGES.status, 'footer.status'), item(PAGES.security, 'footer.security'), item(PAGES.accessibility, 'footer.accessibility'), item(PAGES.legal, 'footer.legal')])}
        </div>
        <div class="kayzen-credit" data-publisher="${PUBLISHER}">
          <img src="/kayzen-logo.webp" alt="" width="48" height="48" loading="lazy" decoding="async" class="size-12 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="font-display text-lg font-bold tracking-tight text-white uppercase" ${text('footer.kayzen.title')}></p>
            <p class="text-sm text-white/75" ${text('footer.kayzen.body')}></p>
          </div>
          <a class="btn btn-on-navy btn-compact" href="${PUBLISHER_URL}" rel="noopener"><span ${text('footer.kayzen.link')}></span>${icon('arrowUpRight', 'size-4')}</a>
        </div>
        <div class="mt-8 flex flex-col items-start justify-between gap-3 border-t border-white/15 pt-8 text-xs text-white/80 md:flex-row md:items-center">
          <p ${text('footer.license')}></p>
          <p><span ${text('built')}></span> <!--@built--></p>
        </div>
      </div>
    </footer>
    ${a11yPanel()}
    ${overlays()}`;
}
