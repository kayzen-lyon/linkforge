/**
 * Shared page chrome (head tags, header, footer) as HTML strings.
 *
 * These are injected into every HTML entry at build time by the Vite plugin in
 * `vite.config.ts`, so both pages ship fully rendered markup and stay in sync
 * without a framework. Static, trusted strings only: no user data goes here.
 */

export const REPO_URL = 'https://github.com/kayzen-lyon/linkforge';

export type PageId = 'home' | 'docs';

/** Applied before first paint so an explicit theme choice never flashes. */
const THEME_BOOT =
  "try{var t=localStorage.getItem('lf-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}";

export function headTags(): string {
  return `<meta name="color-scheme" content="light dark" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script>${THEME_BOOT}</script>`;
}

const LOGO = `<svg class="size-7 shrink-0" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--code-bg)"/><rect x="6" y="11" width="13" height="10" rx="5" fill="none" stroke="var(--code-fg)" stroke-width="2.6"/><rect x="13" y="11" width="13" height="10" rx="5" fill="none" stroke="var(--ember)" stroke-width="2.6"/></svg>`;

const ICON_SUN = `<svg class="icon-sun size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const ICON_MOON = `<svg class="icon-moon size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`;
const ICON_MENU = `<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
const ICON_OUT = `<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>`;

interface NavLink {
  readonly href: string;
  readonly label: string;
  readonly page?: PageId;
}

const NAV: readonly NavLink[] = [
  { href: '/#demo', label: 'Live demo' },
  { href: '/#features', label: 'Features' },
  { href: '/#examples', label: 'Code examples' },
  { href: '/#self-host', label: 'Self-hosting' },
  { href: '/docs', label: 'API reference', page: 'docs' },
];

function navLinks(current: PageId): string {
  return NAV.map((link) => {
    const active = link.page === current ? ' aria-current="page"' : '';
    return `<a class="nav-link" href="${link.href}"${active}>${link.label}</a>`;
  }).join('\n          ');
}

export function header(current: PageId): string {
  return `<a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="shell flex h-14 items-center gap-3">
        <a href="/" class="brand" aria-label="LinkForge home">${LOGO}<span>LinkForge</span></a>
        <nav id="site-nav" class="site-nav" aria-label="Main">
          ${navLinks(current)}
          <a class="nav-link nav-link-out" href="${REPO_URL}" rel="noopener">GitHub ${ICON_OUT}</a>
        </nav>
        <div class="ml-auto flex items-center gap-1 lg:ml-0">
          <button type="button" id="theme-toggle" class="icon-btn" aria-label="Switch colour theme">${ICON_SUN}${ICON_MOON}</button>
          <button type="button" id="nav-toggle" class="icon-btn lg:hidden" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">${ICON_MENU}</button>
        </div>
      </div>
    </header>`;
}

export function footer(): string {
  return `<footer class="site-footer">
      <div class="shell flex flex-col gap-8 py-10 sm:flex-row sm:justify-between">
        <div class="flex max-w-sm flex-col gap-3">
          <a href="/" class="brand" aria-label="LinkForge home">${LOGO}<span>LinkForge</span></a>
          <p class="text-sm text-muted">An open-source API that turns a URL into metadata, screenshots, PDFs, custom fields and readable content. Released under the MIT licence.</p>
        </div>
        <nav class="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:flex sm:gap-16" aria-label="Footer">
          <ul class="flex flex-col gap-2">
            <li class="footer-title">Product</li>
            <li><a class="footer-link" href="/#demo">Live demo</a></li>
            <li><a class="footer-link" href="/#features">Features</a></li>
            <li><a class="footer-link" href="/#examples">Code examples</a></li>
            <li><a class="footer-link" href="/#self-host">Self-hosting</a></li>
          </ul>
          <ul class="flex flex-col gap-2">
            <li class="footer-title">Developers</li>
            <li><a class="footer-link" href="/docs">API reference</a></li>
            <li><a class="footer-link" href="/api/v1/openapi.json">OpenAPI document</a></li>
            <li><a class="footer-link" href="/health">Service status</a></li>
            <li><a class="footer-link" href="${REPO_URL}" rel="noopener">Source on GitHub</a></li>
          </ul>
        </nav>
      </div>
    </footer>`;
}
