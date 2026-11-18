/**
 * Shared page chrome (head tags, header, footer) as HTML strings.
 *
 * Injected into every HTML entry at build time by the Vite plugin in
 * `vite.config.ts`, so both pages ship fully rendered markup and stay in sync
 * without a framework. Text is not written here: elements carry `data-i18n`
 * keys that the same plugin fills in French and the client can re-translate.
 */
import type { common } from '../i18n/fr';

export const REPO_URL = 'https://github.com/kayzen-lyon/linkforge';

export type PageId = 'home' | 'docs';
type Key = keyof typeof common;

/**
 * Runs before first paint: applies a stored theme, and when the visitor reads
 * English hides the French markup until the module script has translated it
 * (with a timeout so a script failure can never leave the page blank).
 */
const BOOT = [
  'try{var d=document.documentElement,s=localStorage,',
  "t=s.getItem('lf-theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);",
  "var l=new URLSearchParams(location.search).get('lang');",
  "if(l!=='fr'&&l!=='en')l=s.getItem('lf-lang');",
  "if(l==='en'){d.lang='en';d.classList.add('i18n-pending');",
  "setTimeout(function(){d.classList.remove('i18n-pending')},2000)}}catch(e){}",
].join('');

export function headTags(): string {
  return `<meta name="color-scheme" content="light dark" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script>${BOOT}</script>`;
}

const LOGO = `<svg class="size-7 shrink-0" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--code-bg)"/><rect x="6" y="11" width="13" height="10" rx="5" fill="none" stroke="var(--code-fg)" stroke-width="2.6"/><rect x="13" y="11" width="13" height="10" rx="5" fill="none" stroke="var(--ember-bright)" stroke-width="2.6"/></svg>`;

const ICON_SUN = `<svg class="icon-sun size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const ICON_MOON = `<svg class="icon-moon size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`;
const ICON_MENU = `<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
const ICON_OUT = `<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>`;

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
  { href: '/docs', key: 'nav.docs', page: 'docs' },
];

const attr = (pairs: Readonly<Record<string, Key>>): string =>
  `data-i18n-attr="${Object.entries(pairs)
    .map(([name, key]) => `${name}:${key}`)
    .join(';')}"`;

const text = (key: Key): string => `data-i18n="${key}"`;

export function header(current: PageId): string {
  const links = NAV.map((link) => {
    const active = link.page === current ? ' aria-current="page"' : '';
    return `<a class="nav-link" href="${link.href}"${active} ${text(link.key)}></a>`;
  }).join('\n          ');

  return `<a class="skip-link" href="#main" ${text('skip')}></a>
    <header class="site-header">
      <div class="shell flex h-14 items-center gap-2 sm:gap-3">
        <a href="/" class="brand" ${attr({ 'aria-label': 'brand.home' })}>${LOGO}<span>LinkForge</span></a>
        <nav id="site-nav" class="site-nav" ${attr({ 'aria-label': 'nav.label' })}>
          ${links}
          <a class="nav-link" href="${REPO_URL}" rel="noopener"><span>GitHub</span>${ICON_OUT}</a>
        </nav>
        <div class="ml-auto flex items-center gap-1">
          <div class="lang-switch" role="group" ${attr({ 'aria-label': 'lang.label' })}>
            <button type="button" data-lang="fr" aria-pressed="true" lang="fr" ${attr({ 'aria-label': 'lang.fr' })}>FR</button>
            <button type="button" data-lang="en" aria-pressed="false" lang="en" ${attr({ 'aria-label': 'lang.en' })}>EN</button>
          </div>
          <button type="button" id="theme-toggle" class="icon-btn" ${attr({ 'aria-label': 'theme.toDark' })}>${ICON_SUN}${ICON_MOON}</button>
          <button type="button" id="nav-toggle" class="icon-btn lg:hidden" aria-expanded="false" aria-controls="site-nav" ${attr({ 'aria-label': 'nav.menu' })}>${ICON_MENU}</button>
        </div>
      </div>
    </header>`;
}

export function footer(): string {
  const item = (href: string, key: Key, external = false): string =>
    `<li><a class="footer-link" href="${href}"${external ? ' rel="noopener"' : ''} ${text(key)}></a></li>`;

  return `<footer class="site-footer">
      <div class="shell flex flex-col gap-8 py-10 md:flex-row md:justify-between">
        <div class="flex max-w-sm flex-col gap-3">
          <a href="/" class="brand" ${attr({ 'aria-label': 'brand.home' })}>${LOGO}<span>LinkForge</span></a>
          <p class="text-sm text-muted" ${text('footer.tagline')}></p>
        </div>
        <nav class="grid grid-cols-1 gap-8 text-sm min-[420px]:grid-cols-2 md:gap-16" ${attr({ 'aria-label': 'footer.label' })}>
          <div class="flex flex-col gap-2">
            <p class="footer-title" ${text('footer.product')}></p>
            <ul class="flex flex-col gap-2">
              ${item('/#demo', 'footer.demo')}
              ${item('/#features', 'footer.features')}
              ${item('/#examples', 'footer.examples')}
              ${item('/#self-host', 'footer.selfHost')}
            </ul>
          </div>
          <div class="flex flex-col gap-2">
            <p class="footer-title" ${text('footer.developers')}></p>
            <ul class="flex flex-col gap-2">
              ${item('/docs', 'footer.docs')}
              ${item('/api/v1/openapi.json', 'footer.openapi')}
              ${item('/health', 'footer.health')}
              ${item(REPO_URL, 'footer.source', true)}
            </ul>
          </div>
        </nav>
      </div>
    </footer>`;
}
