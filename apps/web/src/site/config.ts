/** Site-wide constants and routing helpers (pure: shared by the build and the browser). */

export const BRAND = 'Omnillink';
/** Trade name of the publisher. The publisher's personal name lives on the legal page only. */
export const PUBLISHER = 'KAYZEN';
export const PUBLISHER_URL = 'https://www.kayzen-lyon.com';
/** Production origin, used for canonical URLs, the sitemap and social tags. */
export const SITE_ORIGIN = 'https://linkforge-sable.vercel.app';
export const REPO_URL = 'https://github.com/kayzen-lyon/linkforge';

export type Lang = 'fr' | 'en';
export const LANGS: readonly Lang[] = ['fr', 'en'];
export const DEFAULT_LANG: Lang = 'fr';

/** Every page of the site. French lives at the root, English under `/en`. */
export type PageId = 'home' | 'docs' | 'accessibility' | 'legal';
export const PAGES: Readonly<Record<PageId, string>> = {
  home: '/',
  docs: '/docs',
  accessibility: '/accessibility',
  legal: '/legal',
};

/** Keys written to localStorage: preferences only, never sent anywhere. */
export const STORAGE = { theme: 'omnillink-theme', lang: 'omnillink-lang', a11y: 'omnillink-a11y' } as const;

export const isLang = (value: unknown): value is Lang => value === 'fr' || value === 'en';

/** Path of a page in a language: `pagePath('docs', 'en')` → `/en/docs`. */
export function pagePath(page: PageId, lang: Lang): string {
  const base = PAGES[page];
  if (lang === DEFAULT_LANG) return base;
  return base === '/' ? '/en/' : `/en${base}`;
}

/** Reads a pathname back into its page and language (tolerates `.html` and trailing slashes). */
export function parsePath(pathname: string): { readonly page: PageId; readonly lang: Lang } {
  let path = pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  let lang: Lang = DEFAULT_LANG;
  if (path === '/en' || path.startsWith('/en/')) {
    lang = 'en';
    path = path.slice(3);
  }
  if (path.length > 1) path = path.replace(/\/$/, '');
  if (path === '') path = '/';
  const page = (Object.keys(PAGES) as PageId[]).find((id) => PAGES[id] === path) ?? 'home';
  return { page, lang };
}

/**
 * Rewrites an internal page link for a language, keeping its hash:
 * `localizeHref('/docs#errors', 'en')` → `/en/docs#errors`. Links that do not
 * point at a page of the site (API routes, assets, other sites) are returned as is.
 */
export function localizeHref(href: string, lang: Lang): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const hashAt = href.indexOf('#');
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  let bare = path === '/en' || path === '/en/' ? '/' : path.startsWith('/en/') ? path.slice(3) : path;
  if (bare.length > 1) bare = bare.replace(/\/$/, '');
  const page = (Object.keys(PAGES) as PageId[]).find((id) => PAGES[id] === bare);
  return page === undefined ? href : `${pagePath(page, lang)}${hash}`;
}
