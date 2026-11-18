/**
 * Technology detection (pure, no I/O).
 *
 * The signature table below is hand-written from publicly documented,
 * self-identifying traits of each product: the header it sends, the path its
 * assets live under, the generator tag it prints, the marker its runtime
 * leaves in a bundle or on the DOM. Three principles:
 *
 * - every detection carries the evidence that triggered it, and a version only
 *   when that very evidence states one;
 * - every rule has a confidence: `high` for a trait only that product has,
 *   `medium` for a strong habit, `low` for a hint;
 * - missing a technology is preferred to asserting one wrongly. A product that
 *   leaves no trace is not listed.
 */
import { load, type CheerioAPI } from 'cheerio';

export type TechCategory =
  | 'cms' | 'ecommerce' | 'framework' | 'library' | 'ui' | 'build-tool' | 'analytics'
  | 'tag-manager' | 'monitoring' | 'advertising' | 'cdn' | 'server' | 'hosting' | 'language'
  | 'site-builder' | 'consent' | 'payment' | 'font' | 'chat' | 'security' | 'widget';

export const TECH_CATEGORIES: readonly TechCategory[] = [
  'cms', 'ecommerce', 'framework', 'library', 'ui', 'build-tool', 'analytics', 'tag-manager',
  'monitoring', 'advertising', 'cdn', 'server', 'hosting', 'language', 'site-builder', 'consent',
  'payment', 'font', 'chat', 'security', 'widget',
];

export type TechConfidence = 'high' | 'medium' | 'low';

export interface TechDetection {
  readonly name: string;
  readonly category: TechCategory;
  /** What triggered the detection, e.g. `header server: cloudflare`. */
  readonly evidence: string;
  /** How specific that evidence is to the product. */
  readonly confidence: TechConfidence;
  /** Version stated by the evidence itself; `null` when it states none. */
  readonly version: string | null;
}

/** Text of a first-party script or stylesheet that was read to look for runtime markers. */
export interface TechBundle {
  readonly url: string;
  readonly text: string;
}

/** Result of the built-in in-page probe: key → `true`, or the version found. */
export type TechProbe = Readonly<Record<string, string | true>>;

export interface TechExtras {
  readonly bundles?: readonly TechBundle[];
  readonly probe?: TechProbe | null;
}

type RuleSource = 'header' | 'generator' | 'asset' | 'cookie' | 'markup' | 'bundle' | 'probe';

interface Rule {
  readonly on: RuleSource;
  /** Header name or probe key. */
  readonly key?: string;
  /** Pattern; its first capture group, when present, is the version. */
  readonly re?: RegExp;
  readonly confidence: TechConfidence;
}

interface Signature {
  readonly name: string;
  readonly category: TechCategory;
  readonly rules: readonly Rule[];
  /** Technologies this one is built on (Next.js is always React). */
  readonly implies?: readonly string[];
}

// Rule constructors: one letter each keeps the table readable.
/** Response header. */
const H = (key: string, re: RegExp, confidence: TechConfidence = 'high'): Rule => ({ on: 'header', key, re, confidence });
/** `<meta name="generator">`. */
const G = (re: RegExp): Rule => ({ on: 'generator', re, confidence: 'high' });
/** URL of a script, stylesheet, preload, image or frame. */
const A = (re: RegExp, confidence: TechConfidence = 'high'): Rule => ({ on: 'asset', re, confidence });
/** Name of a cookie the answer sets. */
const C = (re: RegExp, confidence: TechConfidence = 'medium'): Rule => ({ on: 'cookie', re, confidence });
/** Raw markup. */
const M = (re: RegExp, confidence: TechConfidence = 'medium'): Rule => ({ on: 'markup', re, confidence });
/** Content of a first-party bundle. */
const B = (re: RegExp, confidence: TechConfidence = 'high'): Rule => ({ on: 'bundle', re, confidence });
/** Key reported by the in-page probe. */
const P = (key: string, confidence: TechConfidence = 'high'): Rule => ({ on: 'probe', key, confidence });

const T = (
  name: string,
  category: TechCategory,
  rules: readonly Rule[],
  implies?: readonly string[],
): Signature => ({ name, category, rules, ...(implies !== undefined && { implies }) });

/** A dotted version number, as it appears in URLs and banners. */
const V = String.raw`(\d+(?:\.\d+){1,3})`;
/** Library file name with an optional version: `name-1.2.3.min.js`, `name@1.2.3/`, `/name/1.2.3/`. */
const lib = (name: string): RegExp =>
  new RegExp(
    String.raw`(?:^|/)(?:${name}[@/]${V}/[\w./-]*?)?${name}(?:[-.]v?${V})?(?:\.slim|\.bundle|\.esm|\.umd|\.global|\.prod|\.runtime|\.production|\.development)*(?:\.min)?\.(?:m?js|css)(?:[?#]|$)`,
    'i',
  );

const SIGNATURES: readonly Signature[] = [
  // --- CMS and static-site generators ---
  T('WordPress', 'cms', [G(/^WordPress(?: (\d+(?:\.\d+){1,2}))?/i), H('link', /rel="https:\/\/api\.w\.org\/"/), A(/\/wp-includes\/js\/wp-emoji-release\.min\.js\?ver=(\d+(?:\.\d+){1,2})/), A(/\/wp-(?:content|includes)\//), H('x-pingback', /xmlrpc\.php/), P('wordpress')]),
  T('Drupal', 'cms', [G(/^Drupal(?: (\d+))?/i), H('x-generator', /Drupal(?: (\d+))?/i), H('x-drupal-cache', /./), A(/\/sites\/(?:default|all)\/(?:files|modules|themes)\//, 'medium'), P('drupal')]),
  T('Joomla', 'cms', [G(/^Joomla/i), A(/\/media\/(?:jui|system)\/js\//, 'medium')]),
  T('Ghost', 'cms', [G(new RegExp(`^Ghost(?: ${V})?`, 'i')), H('x-powered-by', /Ghost/i)]),
  T('TYPO3', 'cms', [G(/^TYPO3/i), A(/\/typo3(?:conf|temp)\//)]),
  T('Craft CMS', 'cms', [H('x-powered-by', /Craft CMS/i), C(/^CraftSessionId$/)]),
  T('Contao', 'cms', [G(/^Contao/i)]),
  T('SPIP', 'cms', [G(new RegExp(`^SPIP(?: ${V})?`, 'i')), H('composed-by', new RegExp(`SPIP(?: ${V})?`, 'i'))]),
  T('HubSpot CMS', 'cms', [G(/^HubSpot/i), H('x-hs-hub-id', /./)]),
  T('Adobe Experience Manager', 'cms', [A(/\/etc\.clientlibs\//), A(/\/etc\/designs\//, 'medium')]),
  T('Blogger', 'cms', [G(/^blogger/i)]),
  T('Contentful', 'cms', [A(/\.ctfassets\.net\//)]),
  T('Sanity', 'cms', [A(/cdn\.sanity\.io\//)]),
  T('Prismic', 'cms', [A(/(?:images|static)\.prismic\.io\/|\.cdn\.prismic\.io\//)]),
  T('Storyblok', 'cms', [A(/\ba\.storyblok\.com\//)]),
  T('DatoCMS', 'cms', [A(/datocms-assets\.com\//)]),
  T('Hugo', 'cms', [G(new RegExp(`^Hugo(?: ${V})?`, 'i'))]),
  T('Jekyll', 'cms', [G(new RegExp(`^Jekyll(?: v?${V})?`, 'i'))]),
  T('Hexo', 'cms', [G(new RegExp(`^Hexo(?: ${V})?`, 'i'))]),
  T('Eleventy', 'cms', [G(new RegExp(`^Eleventy(?: v?${V})?`, 'i'))]),
  T('Docusaurus', 'cms', [G(new RegExp(`^Docusaurus(?: v?${V})?`, 'i')), P('docusaurus')], ['React']),
  T('VitePress', 'cms', [G(new RegExp(`^VitePress(?: v?${V})?`, 'i'))], ['Vue.js', 'Vite']),
  T('MkDocs', 'cms', [G(new RegExp(`^mkdocs-${V}`, 'i'))]),
  T('Substack', 'cms', [A(/substackcdn\.com\//)]),
  // --- Site builders ---
  T('Wix', 'site-builder', [G(/^Wix\.com/i), H('x-wix-request-id', /./), A(/static\.(?:parastorage|wixstatic)\.com\//), P('wix')]),
  T('Squarespace', 'site-builder', [H('server', /^Squarespace/i), A(/\.squarespace(?:-cdn)?\.com\//), M(/Static\.SQUARESPACE_CONTEXT/, 'high'), P('squarespace')]),
  T('Webflow', 'site-builder', [G(/^Webflow/i), M(/\bdata-wf-(?:site|page)="[0-9a-f]{24}"/, 'high'), P('webflow')]),
  T('Framer', 'site-builder', [G(/^Framer/i), A(/framerusercontent\.com\//)], ['React']),
  T('Weebly', 'site-builder', [A(/cdn\d*\.editmysite\.com\//)]),
  T('Bubble', 'site-builder', [M(/\bbubble_page_load_data\b/, 'high')]),
  T('Carrd', 'site-builder', [G(/^Carrd/i)]),
  // --- E-commerce ---
  T('Shopify', 'ecommerce', [H('x-shopid', /./), H('x-shopify-stage', /./), H('powered-by', /^Shopify/i), A(/cdn\.shopify\.com\//), M(/Shopify\.(?:theme|shop)\s*=/, 'high'), P('shopify')]),
  T('WooCommerce', 'ecommerce', [G(new RegExp(`^WooCommerce(?: ${V})?`, 'i')), A(/\/plugins\/woocommerce\//), P('woocommerce')], ['WordPress']),
  T('Magento', 'ecommerce', [A(/\/static\/version\d+\/frontend\//), M(/data-mage-init=|Mage\.Cookies/, 'high'), C(/^(?:mage-cache|X-Magento)/i)]),
  T('PrestaShop', 'ecommerce', [G(/^PrestaShop/i), H('powered-by', /PrestaShop/i), C(/^PrestaShop-[0-9a-f]{32}$/, 'high')]),
  T('BigCommerce', 'ecommerce', [A(/cdn\d*\.bigcommerce\.com\//)]),
  T('Salesforce Commerce Cloud', 'ecommerce', [A(/\/on\/demandware\.static\//), C(/^dwsid$/, 'high')]),
  T('Ecwid', 'ecommerce', [A(/app\.ecwid\.com\/script\.js/)]),
  T('Snipcart', 'ecommerce', [A(/cdn\.snipcart\.com\//)]),
  // --- Frameworks ---
  T('Next.js', 'framework', [P('next'), H('x-powered-by', /^Next\.js(?: (\d+(?:\.\d+){1,2}))?/i), M(/id="__NEXT_DATA__"/, 'high'), A(/\/_next\/static\//), M(/self\.__next_f\.push\(/, 'high'), H('x-nextjs-cache', /./), H('x-nextjs-prerender', /./)], ['React']),
  T('Nuxt', 'framework', [P('nuxt'), M(/window\.__NUXT__\s*=|id="__NUXT_DATA__"/, 'high'), A(/\/_nuxt\//), H('x-powered-by', /^Nuxt/i)], ['Vue.js']),
  T('Gatsby', 'framework', [G(new RegExp(`^Gatsby(?: ${V})?`, 'i')), M(/id="___gatsby"/, 'high'), P('gatsby')], ['React']),
  T('Astro', 'framework', [G(new RegExp(`^Astro(?: v?${V})?`, 'i')), M(/<astro-island\b/, 'high'), A(/\/_astro\/[\w.-]+\.(?:js|css)/)]),
  T('SvelteKit', 'framework', [M(/\bdata-sveltekit-(?:preload-data|preload-code|reload|noscroll)\b/, 'high'), M(/__sveltekit_[a-z0-9]+\s*=/, 'high'), A(/\/_app\/immutable\//), P('sveltekit')], ['Svelte']),
  T('Remix', 'framework', [M(/window\.__remixContext\s*=/, 'high'), P('remix')], ['React']),
  T('React Router', 'framework', [B(new RegExp(`__reactRouterVersion\\s*=\\s*"${V}`)), M(/window\.__reactRouterContext\s*=/, 'high'), P('reactRouter')], ['React']),
  T('Angular', 'framework', [M(/\bng-version="(\d+(?:\.\d+){1,2})[^"]*"/, 'high'), P('angular')]),
  T('AngularJS', 'framework', [P('angularjs'), A(lib('angular')), M(/<[a-z-]+[^>]*\sng-app(?:=|\s|>)/, 'medium')]),
  T('Qwik', 'framework', [M(/\bq:version="(\d+(?:\.\d+){1,2})[^"]*"/, 'high'), M(/\bq:container="(?:paused|resumed)"/, 'high')]),
  T('Ember.js', 'framework', [P('ember'), M(/id="ember\d+"[^>]*class="[^"]*\bember-view\b/, 'high')]),
  T('Blazor', 'framework', [A(/\/_framework\/blazor\.(?:webassembly|server|web)\.js/)]),
  T('Phoenix LiveView', 'framework', [M(/\bdata-phx-main\b/, 'high')]),
  T('Livewire', 'framework', [M(/\bwire:(?:id|snapshot)="/, 'high'), A(/\/livewire(?:\/livewire)?(?:\.min)?\.js/), P('livewire')], ['Laravel']),
  T('Inertia.js', 'framework', [M(/<div id="app" data-page="\{&quot;component&quot;/, 'high')]),
  T('Hotwire Turbo', 'framework', [P('turbo'), A(lib('turbo')), M(/<meta name="turbo-(?:cache-control|visit-control|refresh-method)"/, 'high')]),
  T('Ruby on Rails', 'framework', [M(/name="csrf-param" content="authenticity_token"/, 'high'), H('x-powered-by', /Phusion Passenger/i, 'medium')]),
  T('Laravel', 'framework', [C(/^laravel_session$/i, 'high')]),
  T('Django', 'framework', [M(/name=["']csrfmiddlewaretoken["']/, 'high'), C(/^csrftoken$/)]),
  T('Express', 'framework', [H('x-powered-by', /^Express$/i)]),
  T('ASP.NET', 'framework', [H('x-aspnet-version', new RegExp(V)), H('x-powered-by', /ASP\.NET/i), M(/name="__VIEWSTATE"/, 'high'), C(/^(?:ASP\.NET_SessionId|\.AspNetCore\.)/, 'high')]),
  T('CodeIgniter', 'framework', [C(/^ci_session$/)]),
  // --- Libraries ---
  T('React', 'library', [B(new RegExp(`version:"${V}[^"]*",rendererPackageName:"react-dom"`)), P('react'), B(/__reactContainer\$|__reactFiber\$/), M(/\bdata-reactroot\b/, 'high'), A(lib('react(?:-dom)?')), A(/\/(?:react|react-dom)@(\d+(?:\.\d+){1,2})\b/)]),
  T('Preact', 'library', [P('preact'), A(lib('preact')), A(/\/preact@(\d+(?:\.\d+){1,2})\b/)]),
  T('Vue.js', 'library', [P('vue'), B(/__vue_app__/), M(/\bdata-v-app\b|data-server-rendered="true"/, 'high'), M(/\sdata-v-[0-9a-f]{8}(?:=""|[\s>])/, 'medium'), A(lib('vue')), A(/\/vue@(\d+(?:\.\d+){1,2})\b/)]),
  T('Svelte', 'library', [M(/class="[^"]*\bsvelte-[a-z0-9]{5,8}\b/, 'high'), B(/\.svelte-[a-z0-9]{5,8}\b/, 'medium'), P('svelte')]),
  T('Solid', 'library', [P('solid'), M(/\b_\$HY\s*=|\bdata-hk="/, 'medium')]),
  T('Lit', 'library', [P('lit')]),
  T('Alpine.js', 'library', [P('alpine'), A(/\/alpinejs@(\d+(?:\.\d+){1,2})\b/), A(lib('alpine(?:js)?')), M(/<[a-z0-9-]+[^>]*\sx-data(?:=|\s|>)/, 'medium')]),
  T('htmx', 'library', [P('htmx'), A(/\/htmx\.org@(\d+(?:\.\d+){1,2})\b/), A(lib('htmx')), M(/<[a-z0-9-]+[^>]*\shx-(?:get|post|boost|swap)=/, 'medium')]),
  T('Stimulus', 'library', [P('stimulus')]),
  T('jQuery', 'library', [P('jquery'), A(/\/jquery@(\d+(?:\.\d+){1,2})\b/), A(lib('jquery')), A(/\/ajax\/libs\/jquery\/(\d+(?:\.\d+){1,2})\//)]),
  T('jQuery UI', 'library', [A(lib('jquery-ui')), P('jqueryui')], ['jQuery']),
  T('Moment.js', 'library', [P('moment'), A(lib('moment'))]),
  T('GSAP', 'library', [P('gsap'), A(/\/gsap(?:@|\/)(\d+(?:\.\d+){1,2})\b/), A(lib('gsap'))]),
  T('Three.js', 'library', [P('three'), A(lib('three'))]),
  T('D3', 'library', [P('d3'), A(lib('d3(?:\\.v\\d)?'))]),
  T('Swiper', 'library', [A(/\/swiper@(\d+(?:\.\d+){1,2})\b/), A(lib('swiper(?:-bundle)?')), M(/class="[^"]*\bswiper-wrapper\b/, 'medium')]),
  T('Leaflet', 'library', [A(/\/leaflet@(\d+(?:\.\d+){1,2})\b/), A(lib('leaflet')), P('leaflet', 'medium')]),
  T('Apollo Client', 'library', [P('apollo')]),
  T('Workbox', 'library', [A(/\/workbox-(?:sw|window)[\w.-]*\.js/), B(/workbox-(?:core|precaching|routing)\b/, 'medium')]),
  // --- UI kits and styling ---
  T('Tailwind CSS', 'ui', [B(new RegExp(`tailwindcss v${V}`)), P('tailwind'), A(/cdn\.tailwindcss\.com/), M(/--tw-(?:ring-offset-shadow|border-spacing-x|translate-x|gradient-from|border-style)\b/, 'high'), B(/--tw-(?:ring-offset-shadow|border-spacing-x|translate-x|gradient-from|border-style)\b/), A(lib('tailwind(?:css)?'))]),
  T('Bootstrap', 'ui', [B(new RegExp(`Bootstrap\\s+v${V}`)), A(/\/bootstrap@(\d+(?:\.\d+){1,2})\b/), A(lib('bootstrap')), P('bootstrap')]),
  T('Bulma', 'ui', [A(/\/bulma@(\d+(?:\.\d+){1,2})\b/), A(lib('bulma'))]),
  T('Material UI', 'ui', [M(/class="[^"]*\bMui[A-Z][A-Za-z]+-root\b/, 'high')], ['React']),
  T('Chakra UI', 'ui', [M(/--chakra-(?:colors|fonts|space)-/, 'high'), M(/class="[^"]*\bchakra-(?:button|stack|text|heading|container)\b/, 'medium')], ['React']),
  T('Mantine', 'ui', [M(/--mantine-(?:color|font|spacing)-/, 'high'), M(/class="[^"]*\bmantine-[A-Za-z]+-root\b/, 'high')], ['React']),
  T('Ant Design', 'ui', [M(/class="[^"]*\bant-(?:btn|layout|menu|row|col)(?:-[a-z]+)?\b[^"]*"/, 'medium')]),
  T('Radix UI', 'ui', [M(/\bdata-radix-(?:collection-item|popper-content-wrapper|scroll-area-viewport|focus-guard|portal)\b|\bid="radix-/, 'high')], ['React']),
  T('Headless UI', 'ui', [M(/\bdata-headlessui-state\b|\bid="headlessui-/, 'high')]),
  T('Vuetify', 'ui', [M(/class="[^"]*\bv-application\b/, 'high')], ['Vue.js']),
  T('styled-components', 'ui', [M(/<style[^>]*\bdata-styled-version="(\d+(?:\.\d+){1,2})/, 'high'), M(/<style[^>]*\bdata-styled="/, 'high')], ['React']),
  T('Emotion', 'ui', [M(/<style[^>]*\bdata-emotion="/, 'high')]),
  T('Font Awesome', 'font', [A(/kit\.fontawesome\.com\//), A(/\/(?:font-?awesome|fontawesome-free)(?:[@/-]v?(\d+(?:\.\d+){1,2}))?\//i), A(/use\.fontawesome\.com\/(?:releases\/v(\d+(?:\.\d+){1,2}))?/)]),
  // --- Build tools ---
  T('Vite', 'build-tool', [B(/__vite__mapDeps|__vitePreload|vite\/modulepreload-polyfill/), M(/__vite__mapDeps|id="vite-plugin-pwa:register-sw"|<script[^>]*src="\/@vite\/client"/, 'high'), M(/<script type="module" crossorigin src="[^"]*\/assets\/[\w.-]+-[\w-]{8}\.js"/, 'medium')]),
  T('webpack', 'build-tool', [M(/\bwebpackChunk[\w$]*\b|\bwebpackJsonp\b/, 'high'), B(/\bwebpackChunk[\w$]*\b|__webpack_require__/), P('webpack')]),
  T('Turbopack', 'build-tool', [A(/\/_next\/static\/chunks\/turbopack-/), M(/\bglobalThis\.TURBOPACK\b/, 'high')]),
  T('Parcel', 'build-tool', [B(/\bparcelRequire[\w$]*\b/), M(/\bparcelRequire[\w$]*\b/, 'high')]),
  // --- Analytics ---
  T('Google Analytics', 'analytics', [A(/googletagmanager\.com\/gtag\/js\?id=G-/), A(/google-analytics\.com\/(?:analytics|ga|g\/collect)/), A(/googletagmanager\.com\/gtag\/js/), M(/\bgtag\(\s*['"]config['"]\s*,\s*['"](?:G|UA)-/, 'high'), P('ga')]),
  T('Matomo', 'analytics', [A(/\/(?:matomo|piwik)\.js/), M(/_paq\.push\(/, 'high'), P('matomo')]),
  T('Plausible', 'analytics', [A(/plausible\.io\/js\//), M(/<script[^>]*data-domain="[^"]+"[^>]*src="[^"]*\/js\/(?:script|plausible)[\w.-]*\.js"/, 'medium'), P('plausible')]),
  T('Fathom', 'analytics', [A(/cdn\.usefathom\.com\//), P('fathom')]),
  T('Umami', 'analytics', [M(/<script[^>]*\bdata-website-id="[0-9a-f-]{36}"/, 'high'), P('umami')]),
  T('Simple Analytics', 'analytics', [A(/scripts\.simpleanalyticscdn\.com\//)]),
  T('GoatCounter', 'analytics', [A(/gc\.zgo\.at\/count\.js/)]),
  T('PostHog', 'analytics', [A(/(?:us|eu)-assets\.i\.posthog\.com\/|app\.posthog\.com\/static\//), M(/\bposthog\.init\(/, 'high'), P('posthog')]),
  T('Mixpanel', 'analytics', [A(/cdn\.mxpnl\.com\//), P('mixpanel')]),
  T('Amplitude', 'analytics', [A(/cdn\.amplitude\.com\//), P('amplitude')]),
  T('Heap', 'analytics', [A(/cdn\.heapanalytics\.com\//), P('heap')]),
  T('Segment', 'analytics', [A(/cdn\.segment\.com\/analytics\.js/), P('segment', 'medium')]),
  T('Hotjar', 'analytics', [A(/static\.hotjar\.com\//), M(/\bhjid\s*:\s*\d+/, 'high'), P('hotjar')]),
  T('Microsoft Clarity', 'analytics', [A(/clarity\.ms\/tag\//), P('clarity')]),
  T('FullStory', 'analytics', [A(/edge\.fullstory\.com\//), P('fullstory')]),
  T('Meta Pixel', 'analytics', [A(/connect\.facebook\.net\/[^/]+\/fbevents\.js/), M(/\bfbq\(\s*['"]init['"]/, 'high'), P('fbq')]),
  T('LinkedIn Insight Tag', 'analytics', [A(/snap\.licdn\.com\/li\.lms-analytics\//)]),
  T('TikTok Pixel', 'analytics', [A(/analytics\.tiktok\.com\/i18n\/pixel\//)]),
  T('Pinterest Tag', 'analytics', [A(/s\.pinimg\.com\/ct\//)]),
  T('X Ads Pixel', 'analytics', [A(/static\.ads-twitter\.com\/uwt\.js/)]),
  T('Yandex Metrica', 'analytics', [A(/mc\.yandex\.(?:ru|com)\/metrika\//)]),
  T('Baidu Tongji', 'analytics', [A(/hm\.baidu\.com\/hm\.js/)]),
  T('Piano Analytics', 'analytics', [A(/tag\.aticdn\.net\//)]),
  T('Cloudflare Web Analytics', 'analytics', [A(/static\.cloudflareinsights\.com\/beacon\.min\.js/)]),
  T('Vercel Analytics', 'analytics', [A(/\/_vercel\/insights\/script\.js/)]),
  T('Vercel Speed Insights', 'analytics', [A(/\/_vercel\/speed-insights\/script\.js/)]),
  T('HubSpot', 'analytics', [A(/js\.hs-scripts\.com\/|js\.hsforms\.net\/|js\.hs-analytics\.net\//), P('hubspot')]),
  T('Klaviyo', 'analytics', [A(/static\.klaviyo\.com\//)]),
  T('Mailchimp', 'analytics', [A(/chimpstatic\.com\/|\.list-manage\.com\//)]),
  // --- Tag managers ---
  T('Google Tag Manager', 'tag-manager', [A(/googletagmanager\.com\/gtm\.js\?id=GTM-/), M(/googletagmanager\.com\/ns\.html\?id=GTM-/, 'high'), A(/googletagmanager\.com\/gtm\.js/), P('gtm')]),
  T('Adobe Experience Platform Launch', 'tag-manager', [A(/assets\.adobedtm\.com\//)]),
  T('Tealium', 'tag-manager', [A(/tags\.tiqcdn\.com\//)]),
  // --- Monitoring ---
  T('Sentry', 'monitoring', [A(/browser\.sentry-cdn\.com\/(\d+(?:\.\d+){1,2})\//), A(/js\.sentry-cdn\.com\//), B(/sentry\.javascript\.(?:browser|react|vue|nextjs|svelte|angular)/), P('sentry')]),
  T('Datadog RUM', 'monitoring', [A(/datadoghq-browser-agent\.com\//), P('datadog')]),
  T('New Relic', 'monitoring', [A(/js-agent\.newrelic\.com\//), M(/\bNREUM\.(?:info|init|loader_config)\s*=/, 'high'), P('newrelic')]),
  T('LogRocket', 'monitoring', [A(/cdn\.(?:logrocket\.io|lr-in(?:gest)?\.com)\//)]),
  T('Bugsnag', 'monitoring', [A(/d2wy8f7a9ursnm\.cloudfront\.net\/.*bugsnag/), P('bugsnag')]),
  // --- Advertising ---
  T('Google AdSense', 'advertising', [A(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/)]),
  T('Google Publisher Tag', 'advertising', [A(/securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js/)]),
  // --- CDN ---
  T('Cloudflare', 'cdn', [H('server', /^cloudflare/i), H('cf-ray', /./), H('cf-cache-status', /./)]),
  T('Fastly', 'cdn', [H('x-fastly-request-id', /./), H('x-served-by', /^cache-/i)]),
  T('Akamai', 'cdn', [H('server', /AkamaiGHost|AkamaiNetStorage/i), H('x-akamai-transformed', /./)]),
  T('Amazon CloudFront', 'cdn', [H('x-amz-cf-id', /./), H('via', /CloudFront/i)]),
  T('Bunny CDN', 'cdn', [H('server', /^BunnyCDN/i), H('cdn-pullzone', /./)]),
  T('KeyCDN', 'cdn', [H('server', /^keycdn/i)]),
  T('Azure Front Door', 'cdn', [H('x-azure-ref', /./)]),
  T('Google Cloud CDN', 'cdn', [H('via', /^1\.1 google$/i, 'medium')]),
  T('Sucuri', 'cdn', [H('x-sucuri-id', /./), H('server', /^Sucuri/i)]),
  T('Imperva', 'cdn', [H('x-iinfo', /./), H('x-cdn', /Imperva|Incapsula/i)]),
  T('Varnish', 'cdn', [H('x-varnish', /./), H('via', /varnish/i, 'medium')]),
  T('jsDelivr', 'cdn', [A(/cdn\.jsdelivr\.net\//)]),
  T('cdnjs', 'cdn', [A(/cdnjs\.cloudflare\.com\//)]),
  T('unpkg', 'cdn', [A(/\bunpkg\.com\//)]),
  T('Google Hosted Libraries', 'cdn', [A(/ajax\.googleapis\.com\/ajax\/libs\//)]),
  T('Cloudinary', 'cdn', [A(/res\.cloudinary\.com\//)]),
  T('imgix', 'cdn', [A(/\.imgix\.net\//)]),
  // --- Hosting ---
  T('Vercel', 'hosting', [H('x-vercel-id', /./), H('server', /^Vercel$/i), H('x-vercel-cache', /./)]),
  T('Netlify', 'hosting', [H('x-nf-request-id', /./), H('server', /^Netlify/i)]),
  T('GitHub Pages', 'hosting', [H('server', /^GitHub\.com$/i), H('x-github-request-id', /./, 'medium')]),
  T('Heroku', 'hosting', [H('via', /vegur/i)]),
  T('Render', 'hosting', [H('x-render-origin-server', /./)]),
  T('Fly.io', 'hosting', [H('fly-request-id', /./), H('server', /^Fly\//i)]),
  T('Railway', 'hosting', [H('x-railway-request-id', /./), H('server', /^railway/i)]),
  T('Deno Deploy', 'hosting', [H('server', /^deno\//i)]),
  T('Amazon S3', 'hosting', [H('server', /^AmazonS3$/i)]),
  T('Google Cloud', 'hosting', [H('server', /^Google Frontend$/i), H('x-cloud-trace-context', /./, 'medium')]),
  T('Microsoft Azure', 'hosting', [H('x-ms-request-id', /./, 'medium')]),
  T('DigitalOcean App Platform', 'hosting', [H('x-do-app-origin', /./)]),
  T('Kinsta', 'hosting', [H('x-kinsta-cache', /./)]),
  T('WP Engine', 'hosting', [H('x-powered-by', /^WP Engine/i)]),
  T('Pantheon', 'hosting', [H('x-pantheon-styx-hostname', /./)]),
  T('Hostinger', 'hosting', [H('platform', /^hostinger$/i)]),
  // --- Servers and languages ---
  T('nginx', 'server', [H('server', new RegExp(`^nginx(?:/${V})?`, 'i'))]),
  T('OpenResty', 'server', [H('server', new RegExp(`^openresty(?:/${V})?`, 'i'))]),
  T('Apache', 'server', [H('server', new RegExp(`^Apache(?:/${V})?(?!-Coyote)`, 'i'))]),
  T('Apache Tomcat', 'server', [H('server', /^Apache-Coyote/i)]),
  T('Microsoft IIS', 'server', [H('server', new RegExp(`Microsoft-IIS(?:/${V})?`, 'i'))]),
  T('LiteSpeed', 'server', [H('server', /^LiteSpeed/i)]),
  T('Caddy', 'server', [H('server', /^Caddy/i)]),
  T('Envoy', 'server', [H('server', /^envoy$/i)]),
  T('Kestrel', 'server', [H('server', /^Kestrel/i)]),
  T('Gunicorn', 'server', [H('server', new RegExp(`^gunicorn(?:/${V})?`, 'i'))]),
  T('Uvicorn', 'server', [H('server', /^uvicorn/i)]),
  T('Phusion Passenger', 'server', [H('server', /Phusion Passenger/i), H('x-powered-by', /Phusion Passenger/i)]),
  T('PHP', 'language', [H('x-powered-by', new RegExp(`^PHP(?:/${V})?`, 'i')), C(/^PHPSESSID$/, 'high')]),
  T('Java', 'language', [C(/^JSESSIONID$/), H('server', /^(?:Apache-Coyote|Jetty)/i, 'medium')]),
  T('Python', 'language', [H('server', /^(?:gunicorn|uvicorn|Werkzeug|waitress)/i), H('server', /\bPython\/(\d+(?:\.\d+){1,2})/i)]),
  T('Ruby', 'language', [H('server', /Phusion Passenger|\bPuma\b|\bUnicorn\b/i, 'medium')]),
  // --- Consent ---
  T('OneTrust', 'consent', [A(/cdn\.cookielaw\.org\//), P('onetrust')]),
  T('Cookiebot', 'consent', [A(/consent\.cookiebot\.com\//), P('cookiebot')]),
  T('Didomi', 'consent', [A(/sdk\.privacy-center\.org\//), P('didomi')]),
  T('Axeptio', 'consent', [A(/static\.axept\.io\//), P('axeptio')]),
  T('tarteaucitron', 'consent', [A(/\/tarteaucitron(?:\.min)?\.js|\/tarteaucitronjs@/), P('tarteaucitron')]),
  T('Usercentrics', 'consent', [A(/(?:app|web\.cmp)\.usercentrics\.eu\//)]),
  T('iubenda', 'consent', [A(/cdn\.iubenda\.com\//)]),
  T('TrustArc', 'consent', [A(/consent\.trustarc\.com\//)]),
  T('Osano', 'consent', [A(/cmp\.osano\.com\//)]),
  T('CookieYes', 'consent', [A(/cdn-cookieyes\.com\//)]),
  T('Complianz', 'consent', [A(/\/plugins\/complianz-gdpr/)], ['WordPress']),
  T('Termly', 'consent', [A(/app\.termly\.io\//)]),
  T('Klaro', 'consent', [A(/\/klaro(?:@[\d.]+)?(?:\/dist)?\/klaro(?:-no-css)?\.js/), P('klaro')]),
  T('Sourcepoint', 'consent', [A(/cdn\.privacy-mgmt\.com\//)]),
  // --- Payment ---
  T('Stripe', 'payment', [A(/js\.stripe\.com\//), P('stripe')]),
  T('PayPal', 'payment', [A(/paypal\.com\/sdk\/js/), A(/paypalobjects\.com\/api\/checkout/), P('paypal')]),
  T('Braintree', 'payment', [A(/js\.braintreegateway\.com\//)]),
  T('Adyen', 'payment', [A(/checkoutshopper-(?:live|test)[\w-]*\.adyen\.com\//)]),
  T('Klarna', 'payment', [A(/(?:x\.klarnacdn\.net|js\.klarna\.com)\//)]),
  T('Square', 'payment', [A(/(?:web\.squarecdn\.com|js\.squareup(?:sandbox)?\.com)\//)]),
  T('Paddle', 'payment', [A(/cdn\.paddle\.com\//), P('paddle')]),
  T('Lemon Squeezy', 'payment', [A(/(?:assets\.lemonsqueezy\.com|app\.lemonsqueezy\.com\/js)\//)]),
  T('Mollie', 'payment', [A(/js\.mollie\.com\//)]),
  // --- Fonts ---
  T('Google Fonts', 'font', [A(/fonts\.(?:googleapis|gstatic)\.com\//)]),
  T('Adobe Fonts', 'font', [A(/use\.typekit\.net\//)]),
  T('Bunny Fonts', 'font', [A(/fonts\.bunny\.net\//)]),
  T('Fontshare', 'font', [A(/api\.fontshare\.com\//)]),
  // --- Chat ---
  T('Intercom', 'chat', [A(/widget\.intercom\.io\//), P('intercom')]),
  T('Crisp', 'chat', [A(/client\.crisp\.chat\//), P('crisp')]),
  T('Zendesk', 'chat', [A(/static\.zdassets\.com\//), P('zendesk')]),
  T('Tawk.to', 'chat', [A(/embed\.tawk\.to\//), P('tawk')]),
  T('Tidio', 'chat', [A(/code\.tidio\.co\//), P('tidio')]),
  T('Drift', 'chat', [A(/js\.driftt\.com\//), P('drift')]),
  T('LiveChat', 'chat', [A(/cdn\.livechatinc\.com\//), P('livechat')]),
  T('Freshchat', 'chat', [A(/wchat\.freshchat\.com\//)]),
  T('Olark', 'chat', [A(/static\.olark\.com\//)]),
  T('Chatwoot', 'chat', [M(/\bchatwootSDK\.run\(/, 'high'), P('chatwoot')]),
  // --- Security ---
  T('reCAPTCHA', 'security', [A(/(?:google\.com|recaptcha\.net)\/recaptcha\/(?:api|enterprise)\.js/), P('recaptcha')]),
  T('hCaptcha', 'security', [A(/(?:js\.)?hcaptcha\.com\/1\/api\.js/), P('hcaptcha')]),
  T('Cloudflare Turnstile', 'security', [A(/challenges\.cloudflare\.com\/turnstile\//), P('turnstile')]),
  // --- Widgets ---
  T('YouTube embed', 'widget', [A(/youtube(?:-nocookie)?\.com\/embed\//)]),
  T('Vimeo embed', 'widget', [A(/player\.vimeo\.com\/video\//)]),
  T('Wistia', 'widget', [A(/fast\.wistia\.(?:com|net)\//)]),
  T('Google Maps', 'widget', [A(/maps\.googleapis\.com\/maps\/api\/js/), A(/google\.com\/maps\/embed/)]),
  T('Mapbox GL JS', 'widget', [A(/api\.mapbox\.com\/mapbox-gl-js\/v(\d+(?:\.\d+){1,2})\//), P('mapbox')]),
  T('Calendly', 'widget', [A(/assets\.calendly\.com\//)]),
  T('Typeform', 'widget', [A(/embed\.typeform\.com\//)]),
  T('Trustpilot', 'widget', [A(/widget\.trustpilot\.com\//)]),
  T('Disqus', 'widget', [A(/\.disqus\.com\/embed\.js/)]),
  T('Algolia', 'widget', [A(/\/(?:algoliasearch|instantsearch\.js|docsearch)(?:@|\/)/), P('algolia')]),
];

/**
 * Globals read by the in-page probe: probe key → dot path from `window`.
 * A key is reported when the path resolves to something; when the value looks
 * like a version number it is kept as the version. The list is fixed: callers
 * never contribute a path or a script.
 */
export const PROBE_GLOBALS: ReadonlyArray<readonly [key: string, path: string]> = [
  ['jquery', 'jQuery.fn.jquery'], ['jqueryui', 'jQuery.ui.version'], ['react', 'React.version'],
  ['preact', 'preact.options'], ['vue', 'Vue.version'], ['angularjs', 'angular.version.full'],
  ['angular', 'ng.getComponent'], ['next', 'next.version'], ['next', '__NEXT_DATA__.page'],
  ['nuxt', '__NUXT__'], ['nuxt', 'useNuxtApp'], ['gatsby', '___gatsby'], ['remix', '__remixContext'],
  ['reactRouter', '__reactRouterVersion'], ['ember', 'Ember.VERSION'], ['solid', '_$HY'],
  ['lit', 'litElementVersions.0'], ['alpine', 'Alpine.version'], ['htmx', 'htmx.version'],
  ['stimulus', 'Stimulus.controllers'], ['turbo', 'Turbo.session'], ['livewire', 'Livewire.all'],
  ['moment', 'moment.version'], ['gsap', 'gsap.version'],
  ['three', 'THREE.REVISION'], ['d3', 'd3.version'], ['leaflet', 'L.version'],
  ['apollo', '__APOLLO_CLIENT__'], ['bootstrap', 'bootstrap.Tooltip.VERSION'],
  ['webpack', 'webpackChunk_N_E'], ['docusaurus', '__DOCUSAURUS_INSERT_BASEURL_BANNER'],
  ['docusaurus', 'docusaurus.prefetch'], ['wordpress', 'wp.i18n'], ['wordpress', 'wpApiSettings'],
  ['drupal', 'Drupal.behaviors'], ['woocommerce', 'wc_add_to_cart_params'],
  ['shopify', 'Shopify.shop'], ['wix', 'wixBiSession'], ['squarespace', 'Static.SQUARESPACE_CONTEXT'],
  ['webflow', 'Webflow.require'], ['gtm', 'google_tag_manager'], ['ga', 'gaGlobal'],
  ['ga', 'GoogleAnalyticsObject'], ['matomo', 'Matomo.initialized'], ['matomo', 'Piwik.initialized'],
  ['plausible', 'plausible'], ['fathom', 'fathom.trackPageview'], ['umami', 'umami.track'],
  ['posthog', 'posthog.__loaded'], ['mixpanel', 'mixpanel.__loaded'], ['amplitude', 'amplitude.getInstance'],
  ['heap', 'heap.track'], ['segment', 'analytics.initialized'], ['hotjar', 'hj.q'], ['hotjar', '_hjSettings'],
  ['clarity', 'clarity.q'], ['fullstory', '_fs_namespace'], ['fbq', 'fbq.version'], ['hubspot', '_hsq'],
  ['sentry', '__SENTRY__'], ['datadog', 'DD_RUM.getInternalContext'],
  ['newrelic', 'NREUM.info'], ['bugsnag', 'Bugsnag.notify'], ['onetrust', 'OneTrust.IsAlertBoxClosed'],
  ['cookiebot', 'Cookiebot.consent'], ['didomi', 'Didomi.getUserConsentStatusForAll'],
  ['axeptio', 'axeptioSDK'], ['tarteaucitron', 'tarteaucitron.job'], ['klaro', 'klaro.getManager'],
  ['stripe', 'Stripe.version'], ['paypal', 'paypal.Buttons'], ['paddle', 'Paddle.Checkout'],
  ['intercom', 'Intercom'], ['crisp', '$crisp'], ['zendesk', 'zE'], ['tawk', 'Tawk_API'],
  ['tidio', 'tidioChatApi'], ['drift', 'drift.api'], ['livechat', 'LiveChatWidget'],
  ['chatwoot', 'chatwootSDK'], ['recaptcha', 'grecaptcha.execute'], ['hcaptcha', 'hcaptcha.execute'],
  ['turnstile', 'turnstile.render'], ['mapbox', 'mapboxgl.version'], ['algolia', 'algoliasearch.version'],
];

/**
 * The built-in probe. Runs inside the rendered page (serialised by
 * Playwright, so it must be self-contained): reads the fixed list of globals
 * and a few runtime markers frameworks leave on DOM nodes. It only reads; the
 * values it returns are re-validated by {@link sanitizeProbe}, since the page
 * controls everything it touches.
 */
export function probeInPage(globals: ReadonlyArray<readonly [string, string]>): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const scope = globalThis as unknown as Record<string, unknown> & {
    document: { querySelectorAll(selector: string): ArrayLike<Record<string, unknown>>; body: unknown };
    getComputedStyle(element: unknown): { getPropertyValue(name: string): string };
  };
  const note = (key: string, value: unknown): void => {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    const version = /^v?\d+(?:\.\d+){0,3}[\w.+-]{0,24}$/.test(text) ? text : true;
    if (out[key] === undefined || out[key] === true) out[key] = version;
  };
  for (const [key, path] of globals) {
    try {
      let value: unknown = scope;
      for (const part of path.split('.')) {
        if (value === undefined || value === null) break;
        value = (value as Record<string, unknown>)[part];
      }
      if (value !== undefined && value !== null && value !== false) note(key, value);
    } catch {
      // A hostile getter: this global is simply not reported.
    }
  }
  try {
    const nodes = Array.from(
      scope.document.querySelectorAll('body, body > *, body > * > *, #root, #app, #__next, #__nuxt'),
    ).slice(0, 300);
    for (const node of nodes) {
      const keys = Object.keys(node);
      if (keys.some((key) => /^__react(?:Container|Fiber|Props)\$/.test(key)) || '_reactRootContainer' in node) {
        note('react', true);
      }
      if ('__vue_app__' in node) note('vue', (node['__vue_app__'] as { version?: unknown } | null)?.version);
      if ('__vue__' in node) note('vue', true);
      if (keys.some((key) => key.startsWith('__svelte'))) note('svelte', true);
    }
    if (Object.keys(scope).some((key) => key.startsWith('__sveltekit_'))) note('sveltekit', true);
    const style = scope.getComputedStyle(scope.document.body);
    const tailwindVariables = [
      '--tw-ring-offset-shadow', '--tw-border-spacing-x', '--tw-translate-x', '--tw-border-style',
      '--tw-shadow', '--tw-ring-shadow', '--tw-gradient-position', '--tw-font-weight', '--tw-leading',
    ];
    if (tailwindVariables.some((name) => style.getPropertyValue(name).trim() !== '')) note('tailwind', true);
  } catch {
    // The document is gone or exotic: keep what the globals gave.
  }
  return out;
}

const PROBE_KEYS: ReadonlySet<string> = new Set([
  ...PROBE_GLOBALS.map(([key]) => key),
  'svelte', 'sveltekit', 'tailwind',
]);

/** Keeps only known keys with `true` or a short version string: the page is not trusted. */
export function sanitizeProbe(raw: unknown): TechProbe {
  const clean: Record<string, string | true> = {};
  if (typeof raw !== 'object' || raw === null) return clean;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!PROBE_KEYS.has(key)) continue;
    if (typeof value === 'string' && /^v?\d+(?:\.\d+){0,3}[\w.+-]{0,24}$/.test(value)) {
      clean[key] = value.replace(/^v/, '');
    } else if (value === true || typeof value === 'string') {
      clean[key] = true;
    }
  }
  return clean;
}

const clip = (value: string): string => (value.length > 120 ? `${value.slice(0, 117)}…` : value);
const RANK: Readonly<Record<TechConfidence, number>> = { high: 3, medium: 2, low: 1 };

/** Variant prefixes and colour scales only Tailwind-style utility CSS produces. */
const TW_VARIANT = /^(?:(?:sm|md|lg|xl|2xl|hover|focus|focus-visible|active|disabled|dark|group-hover|peer-focus|first|last|motion-safe|motion-reduce|print|max-(?:sm|md|lg|xl)):)+-?[a-z][\w./[\]%#-]*$/;
const TW_SCALE = /^-?(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|shadow|accent|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)(?:\/\d{1,3})?$/;
const TW_UTILITY = /^-?(?:[pm][xytrblse]?-(?:\d+(?:\.5)?|px|auto)|gap(?:-[xy])?-\d+(?:\.5)?|space-[xy]-\d+(?:\.5)?|(?:min-|max-)?[wh]-(?:\d+(?:\.5)?|full|screen|px|auto|fit|min|max|\d+\/\d+)|max-w-(?:xs|sm|md|lg|xl|[2-7]xl|prose|screen-\w+)|text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-(?:thin|light|normal|medium|semibold|bold|extrabold|black|sans|serif|mono)|leading-(?:\d+|none|tight|snug|normal|relaxed|loose)|tracking-(?:tighter|tight|normal|wide|wider|widest)|rounded(?:-[trbl]{1,2})?(?:-(?:none|sm|md|lg|xl|[23]xl|full))?|items-(?:start|end|center|baseline|stretch)|justify-(?:start|end|center|between|around|evenly)|grid-cols-\d+|col-span-\d+|flex-(?:row|col|wrap|1|auto|none)|inline-flex|z-\d+|opacity-\d+|duration-\d+|inset-(?:0|x-0|y-0)|sr-only|line-clamp-\d|aspect-(?:square|video)|object-(?:cover|contain)|overflow-(?:hidden|auto|x-auto|y-auto)|shadow-(?:sm|md|lg|xl|2xl|inner)|transition-(?:all|colors|opacity|transform)|backdrop-blur(?:-\w+)?)$/;

/**
 * Tailwind leaves no file name behind (its CSS is compiled into the site's own
 * stylesheet), but its markup is unmistakable in bulk. Reported only when
 * three independent traits are present: many distinct utilities, responsive or
 * state variants (`md:flex`), and palette-scale colours (`text-slate-700`).
 * Bootstrap or hand-written utility classes fail the last two.
 */
function tailwindFromClasses($: CheerioAPI): TechDetection | null {
  const utilities = new Set<string>();
  const variants = new Set<string>();
  const scales = new Set<string>();
  $('[class]')
    .slice(0, 3000)
    .each((_, element) => {
      for (const token of ($(element).attr('class') ?? '').split(/\s+/)) {
        if (token === '' || token.length > 80) continue;
        if (TW_VARIANT.test(token)) variants.add(token);
        else if (TW_SCALE.test(token)) scales.add(token);
        else if (TW_UTILITY.test(token)) utilities.add(token);
      }
    });
  if (utilities.size < 15 || variants.size < 3 || scales.size < 2) return null;
  const total = utilities.size + variants.size + scales.size;
  const samples = [[...variants][0], [...scales][0], [...utilities][0]].join(', ');
  return {
    name: 'Tailwind CSS',
    category: 'ui',
    evidence: clip(`markup: ${total} distinct utility classes (${samples}…)`),
    confidence: 'medium',
    version: null,
  };
}

interface Match {
  readonly evidence: string;
  readonly confidence: TechConfidence;
  readonly version: string | null;
}

/** First capture group that took part in the match: the version, by convention of the table. */
const versionOf = (match: RegExpMatchArray): string | null =>
  match.slice(1).find((group) => group !== undefined) ?? null;

/** Path of a bundle URL, short enough to quote in an evidence string. */
function bundleLabel(url: string): string {
  try {
    return new URL(url).pathname.slice(-60);
  } catch {
    return url.slice(-60);
  }
}

/**
 * Detects the technologies visible in a document, its response headers and,
 * when given, its first-party bundles and the result of the in-page probe.
 *
 * @param headers - Response headers, lower-cased names.
 * @param cookieNames - Names of the cookies the answer sets.
 * @returns One entry per technology, in table order: the most specific
 *   evidence wins, and among equals the one that states a version.
 */
export function detectTechnologies(
  html: string,
  headers: Readonly<Record<string, string>>,
  cookieNames: readonly string[] = [],
  extras: TechExtras = {},
): TechDetection[] {
  const $ = load(html);
  const generators = $('meta[name="generator" i]')
    .toArray()
    .map((node) => ($(node).attr('content') ?? '').trim())
    .filter((value) => value !== '');
  const assets = $('script[src], link[href], img[src], iframe[src], source[src]')
    .toArray()
    .slice(0, 1000)
    .map((node) => $(node).attr('src') ?? $(node).attr('href') ?? '')
    .filter((value) => value !== '' && !value.startsWith('data:'));
  const bundles = extras.bundles ?? [];
  const probe = extras.probe ?? {};

  const evaluate = (rule: Rule): Match | null => {
    const { re, confidence } = rule;
    const found = (label: string, text: string, match: RegExpMatchArray): Match => ({
      evidence: `${label}: ${clip(text)}`,
      confidence,
      version: versionOf(match),
    });
    if (rule.on === 'probe') {
      const value = probe[rule.key ?? ''];
      if (value === undefined) return null;
      return { evidence: `probe: ${rule.key ?? ''}`, confidence, version: value === true ? null : value };
    }
    if (re === undefined) return null;
    if (rule.on === 'header') {
      const value = headers[rule.key ?? ''];
      const match = value?.match(re);
      return value !== undefined && match ? found(`header ${rule.key ?? ''}`, value, match) : null;
    }
    const candidates =
      rule.on === 'generator' ? generators : rule.on === 'asset' ? assets : rule.on === 'cookie' ? cookieNames : null;
    if (candidates !== null) {
      const label = rule.on === 'generator' ? 'meta generator' : rule.on;
      for (const candidate of candidates) {
        const match = candidate.match(re);
        if (match) return found(label, candidate, match);
      }
      return null;
    }
    if (rule.on === 'markup') {
      const match = html.match(re);
      return match ? found('markup', match[0], match) : null;
    }
    for (const bundle of bundles) {
      const match = bundle.text.match(re);
      if (match) return found(`bundle ${bundleLabel(bundle.url)}`, match[0], match);
    }
    return null;
  };

  const detections = new Map<string, TechDetection>();
  for (const signature of SIGNATURES) {
    let best: Match | null = null;
    for (const rule of signature.rules) {
      const match = evaluate(rule);
      if (match === null) continue;
      const better =
        best === null ||
        RANK[match.confidence] > RANK[best.confidence] ||
        (RANK[match.confidence] === RANK[best.confidence] && best.version === null && match.version !== null);
      if (better) best = match;
    }
    if (best !== null) {
      detections.set(signature.name, { name: signature.name, category: signature.category, ...best });
    }
  }

  const tailwind = detections.get('Tailwind CSS') ?? null;
  if (tailwind === null) {
    const fromClasses = tailwindFromClasses($);
    if (fromClasses !== null) detections.set(fromClasses.name, fromClasses);
  }

  // What a detected framework is built on, when nothing identified it directly.
  for (const signature of SIGNATURES) {
    const parent = detections.get(signature.name);
    if (parent === undefined || parent.confidence === 'low') continue;
    for (const impliedName of signature.implies ?? []) {
      if (detections.has(impliedName)) continue;
      const implied = SIGNATURES.find((candidate) => candidate.name === impliedName);
      if (implied === undefined) continue;
      detections.set(impliedName, {
        name: impliedName,
        category: implied.category,
        evidence: `implied by ${signature.name}`,
        confidence: parent.confidence,
        version: null,
      });
    }
  }

  const order = new Map(SIGNATURES.map((signature, index) => [signature.name, index]));
  return [...detections.values()].sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
}

/**
 * First-party scripts and stylesheets worth reading for runtime markers:
 * module entry points and preloaded chunks first (that is where a bundler puts
 * the framework runtime), same origin only, at most `limit`.
 */
export function pickBundles(html: string, documentUrl: string, limit: number): string[] {
  const $ = load(html);
  let origin: string;
  try {
    origin = new URL(documentUrl).origin;
  } catch {
    return [];
  }
  const scored: Array<{ url: string; score: number }> = [];
  const push = (reference: string | undefined, score: number): void => {
    if (reference === undefined || reference === '') return;
    try {
      const url = new URL(reference, documentUrl);
      if (url.origin !== origin || !/\.(?:m?js|css)$/i.test(url.pathname)) return;
      url.hash = '';
      if (!scored.some((entry) => entry.url === url.href)) scored.push({ url: url.href, score });
    } catch {
      // Not a URL: nothing to read.
    }
  };
  $('script[src]').each((index, element) => {
    const isModule = ($(element).attr('type') ?? '').toLowerCase() === 'module';
    push($(element).attr('src'), (isModule ? 30 : 20) - Math.min(index, 9));
  });
  $('link[rel="stylesheet" i][href]').each((index, element) => push($(element).attr('href'), 25 - Math.min(index, 9)));
  $('link[rel="modulepreload" i][href]').each((index, element) => push($(element).attr('href'), 15 - Math.min(index, 9)));
  const sorted = scored.sort((a, b) => b.score - a.score);
  // Always keep room for one stylesheet: Tailwind and Bootstrap sign their CSS, not their JS.
  const firstCss = sorted.find((entry) => entry.url.split('?')[0]?.endsWith('.css') === true);
  const picked = sorted.slice(0, limit);
  if (firstCss !== undefined && !picked.includes(firstCss) && limit > 0) picked[picked.length - 1] = firstCss;
  return picked.map((entry) => entry.url);
}
