/** Site-wide constants and routing helpers (pure: shared by the build and the browser). */

export const BRAND = 'Omnillink';
/** Trade name of the publisher. The publisher's personal name lives on the legal page only. */
export const PUBLISHER = 'KAYZEN';
export const PUBLISHER_URL = 'https://www.kayzen-lyon.com';
/** Production origin, used for canonical URLs, the sitemap and social tags. */
export const SITE_ORIGIN = 'https://omnillink.kayzen-lyon.com';
export const REPO_URL = 'https://github.com/kayzen-lyon/linkforge';
/** Where the site's own sources live in the repository ("edit this page" links). */
export const REPO_WEB_DIR = `${REPO_URL}/blob/main/apps/web`;

/**
 * Languages of the site. Adding one is a line here, plus its dictionaries in
 * `src/i18n/<code>/` and a flag in `public/flags/`. `endonym` is the name of
 * the language in that language: the only label a visitor who cannot read the
 * current page is sure to recognise.
 */
export const LOCALES = [
  { code: 'fr', endonym: 'Français', flag: 'fr', og: 'fr_FR', prefix: '' },
  { code: 'en', endonym: 'English', flag: 'gb', og: 'en_GB', prefix: '/en' },
] as const;

export type Lang = (typeof LOCALES)[number]['code'];
export type Locale = (typeof LOCALES)[number];
export const LANGS: readonly Lang[] = LOCALES.map((locale) => locale.code);
export const DEFAULT_LANG: Lang = 'fr';
export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);
export const localeOf = (lang: Lang): Locale => LOCALES.find((locale) => locale.code === lang) ?? LOCALES[0];

/** Guides: static, build-rendered pages under `/docs/<slug>`. Order is the reading order. */
export const GUIDES = [
  'quickstart',
  'self-hosting',
  'sdk',
  'ai-agents',
  'recipes',
  'errors',
  'limits',
  'security',
  'glossary',
  'changelog',
] as const;
export type GuideId = (typeof GUIDES)[number];

/** Every page of the site: its path (French; other languages add their prefix). */
export const PAGES = {
  home: '/',
  playground: '/playground',
  docs: '/docs',
  ...(Object.fromEntries(GUIDES.map((id) => [id, `/docs/${id}`])) as Record<GuideId, string>),
  status: '/status',
  accessibility: '/accessibility',
  legal: '/legal',
  'not-found': '/404',
  offline: '/offline',
} as const;
export type PageId = keyof typeof PAGES;
export const PAGE_IDS = Object.keys(PAGES) as PageId[];
export const isGuide = (page: PageId): page is GuideId => (GUIDES as readonly string[]).includes(page);
/** Pages that must not be indexed or listed in the sitemap. */
export const UTILITY_PAGES: readonly PageId[] = ['not-found', 'offline'];

/**
 * Keys written to the visitor's browser. Preferences only; nothing is sent
 * anywhere. `history` is written only after the visitor turns the playground
 * history on.
 */
export const STORAGE = {
  theme: 'omnillink-theme',
  lang: 'omnillink-lang',
  a11y: 'omnillink-a11y',
  banner: 'omnillink-banner',
  history: 'omnillink-history',
} as const;

/** Path of a page in a language: `pagePath('docs', 'en')` → `/en/docs`. */
export function pagePath(page: PageId, lang: Lang): string {
  const base = PAGES[page];
  const { prefix } = localeOf(lang);
  if (prefix === '') return base;
  return base === '/' ? `${prefix}/` : `${prefix}${base}`;
}

/** Splits a pathname into its language and the language-neutral path (`/en/docs/` → en, `/docs`). */
function splitPath(pathname: string): { readonly lang: Lang; readonly bare: string } {
  let path = pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  let lang: Lang = DEFAULT_LANG;
  for (const locale of LOCALES) {
    if (locale.prefix !== '' && (path === locale.prefix || path.startsWith(`${locale.prefix}/`))) {
      lang = locale.code;
      path = path.slice(locale.prefix.length);
      break;
    }
  }
  if (path.length > 1) path = path.replace(/\/$/, '');
  return { lang, bare: path === '' ? '/' : path };
}

const pageAt = (bare: string): PageId | undefined => PAGE_IDS.find((id) => PAGES[id] === bare);

/** Reads a pathname back into its page and language. Unknown paths are the not-found page. */
export function parsePath(pathname: string): { readonly page: PageId; readonly lang: Lang } {
  const { lang, bare } = splitPath(pathname);
  return { page: pageAt(bare) ?? 'not-found', lang };
}

/**
 * Rewrites an internal page link for a language, keeping its query and hash:
 * `localizeHref('/docs#errors', 'en')` → `/en/docs#errors`. Links that do not
 * point at a page of the site (API routes, assets, other sites) are returned as is.
 */
export function localizeHref(href: string, lang: Lang): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? '' : href.slice(cut);
  const page = pageAt(splitPath(path).bare);
  return page === undefined ? href : `${pagePath(page, lang)}${rest}`;
}
