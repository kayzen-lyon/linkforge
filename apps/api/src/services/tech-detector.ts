/**
 * Technology detection from one HTTP answer (pure, no I/O).
 *
 * The signature table below is hand-written from publicly documented,
 * self-identifying traits of each product (the header it sends, the path its
 * assets live under, the generator tag it prints). It is deliberately small:
 * a detection is only reported with the evidence that triggered it, and a
 * product that hides its traces is simply not listed.
 */
import { load } from 'cheerio';

export type TechCategory =
  | 'cms' | 'ecommerce' | 'framework' | 'library' | 'analytics' | 'tag-manager' | 'cdn'
  | 'server' | 'hosting' | 'language' | 'site-builder' | 'consent' | 'payment' | 'font' | 'chat';

export interface TechDetection {
  readonly name: string;
  readonly category: TechCategory;
  /** What triggered the detection, e.g. `header server: cloudflare`. */
  readonly evidence: string;
}

interface Signature {
  readonly name: string;
  readonly category: TechCategory;
  /** Response header name → pattern on its value. */
  readonly headers?: Readonly<Record<string, RegExp>>;
  /** Pattern on `<meta name="generator">`. */
  readonly generator?: RegExp;
  /** Pattern on a `<script src>` or `<link href>` URL. */
  readonly asset?: RegExp;
  /** Pattern on the raw markup (globals, data attributes, comments). */
  readonly markup?: RegExp;
  /** Pattern on a `Set-Cookie` name. */
  readonly cookie?: RegExp;
}

const SIGNATURES: readonly Signature[] = [
  // CMS
  { name: 'WordPress', category: 'cms', generator: /^WordPress/i, asset: /\/wp-(?:content|includes)\//, headers: { link: /rel="https:\/\/api\.w\.org\/"/ } },
  { name: 'Drupal', category: 'cms', generator: /^Drupal/i, headers: { 'x-generator': /Drupal/i, 'x-drupal-cache': /./ }, asset: /\/sites\/(?:default|all)\/(?:files|modules|themes)\// },
  { name: 'Joomla', category: 'cms', generator: /^Joomla/i, asset: /\/media\/(?:jui|system)\/js\// },
  { name: 'Ghost', category: 'cms', generator: /^Ghost/i, headers: { 'x-powered-by': /Ghost/i } },
  { name: 'TYPO3', category: 'cms', generator: /^TYPO3/i, asset: /\/typo3(?:conf|temp)\// },
  { name: 'Contentful', category: 'cms', asset: /\.ctfassets\.net\// },
  { name: 'Hugo', category: 'cms', generator: /^Hugo/i },
  { name: 'Jekyll', category: 'cms', generator: /^Jekyll/i },
  { name: 'Docusaurus', category: 'cms', generator: /^Docusaurus/i },
  // Site builders
  { name: 'Wix', category: 'site-builder', generator: /^Wix\.com/i, asset: /static\.(?:parastorage|wixstatic)\.com\//, headers: { 'x-wix-request-id': /./ } },
  { name: 'Squarespace', category: 'site-builder', asset: /\.squarespace(?:-cdn)?\.com\//, markup: /Static\.SQUARESPACE_CONTEXT/ },
  { name: 'Webflow', category: 'site-builder', generator: /^Webflow/i, markup: /data-wf-(?:site|page)=/ },
  { name: 'Framer', category: 'site-builder', generator: /^Framer/i, asset: /framerusercontent\.com\// },
  // E-commerce
  { name: 'Shopify', category: 'ecommerce', asset: /cdn\.shopify\.com\//, headers: { 'x-shopid': /./, 'x-shopify-stage': /./ }, markup: /Shopify\.(?:theme|shop)\b/ },
  { name: 'WooCommerce', category: 'ecommerce', generator: /^WooCommerce/i, asset: /\/plugins\/woocommerce\// },
  { name: 'Magento', category: 'ecommerce', asset: /\/static\/version\d+\/frontend\//, markup: /data-mage-init=|Mage\.Cookies/, cookie: /^(?:mage-cache|X-Magento)/i },
  { name: 'PrestaShop', category: 'ecommerce', generator: /^PrestaShop/i, headers: { 'powered-by': /PrestaShop/i } },
  { name: 'BigCommerce', category: 'ecommerce', asset: /cdn\d*\.bigcommerce\.com\// },
  // Frameworks
  { name: 'Next.js', category: 'framework', headers: { 'x-powered-by': /Next\.js/i }, asset: /\/_next\/static\//, markup: /id="__NEXT_DATA__"/ },
  { name: 'Nuxt', category: 'framework', asset: /\/_nuxt\//, markup: /window\.__NUXT__|id="__NUXT_DATA__"/ },
  { name: 'Gatsby', category: 'framework', generator: /^Gatsby/i, markup: /id="___gatsby"/ },
  { name: 'Astro', category: 'framework', generator: /^Astro/i, markup: /<astro-island\b/ },
  { name: 'SvelteKit', category: 'framework', asset: /\/_app\/immutable\//, markup: /data-sveltekit-/ },
  { name: 'Remix', category: 'framework', markup: /window\.__remixContext/ },
  { name: 'Angular', category: 'framework', markup: /\bng-version="[\d.]+"/ },
  { name: 'Ruby on Rails', category: 'framework', headers: { 'x-powered-by': /Phusion Passenger/i }, markup: /name="csrf-param" content="authenticity_token"/ },
  { name: 'Laravel', category: 'framework', cookie: /^laravel_session$/i },
  { name: 'Django', category: 'framework', markup: /name=["']csrfmiddlewaretoken["']/, cookie: /^csrftoken$/ },
  { name: 'Express', category: 'framework', headers: { 'x-powered-by': /^Express$/i } },
  { name: 'ASP.NET', category: 'framework', headers: { 'x-aspnet-version': /./, 'x-powered-by': /ASP\.NET/i }, markup: /name="__VIEWSTATE"/ },
  // Libraries
  { name: 'React', category: 'library', markup: /data-reactroot|__REACT_DEVTOOLS_GLOBAL_HOOK__/, asset: /\/react(?:-dom)?(?:\.production)?(?:\.min)?\.js/ },
  { name: 'Vue.js', category: 'library', markup: /\bdata-v-[0-9a-f]{8}\b|data-server-rendered="true"/, asset: /\/vue(?:\.runtime)?(?:\.global)?(?:\.prod)?(?:\.min)?\.js/ },
  { name: 'jQuery', category: 'library', asset: /\/jquery(?:-\d[\d.]*)?(?:\.slim)?(?:\.min)?\.js/ },
  { name: 'Bootstrap', category: 'library', asset: /\/bootstrap(?:\.bundle)?(?:\.min)?\.(?:js|css)/ },
  { name: 'Tailwind CSS', category: 'library', asset: /cdn\.tailwindcss\.com|\/tailwind(?:\.min)?\.css/ },
  { name: 'Alpine.js', category: 'library', asset: /\/alpine(?:js)?(?:@[\d.]+)?\/|alpine(?:\.min)?\.js/ },
  { name: 'htmx', category: 'library', asset: /\/htmx(?:\.org)?(?:@[\d.]+)?(?:\/|\.min\.js|\.js)/ },
  // Analytics and tags
  { name: 'Google Analytics', category: 'analytics', asset: /google-analytics\.com\/|googletagmanager\.com\/gtag\/js/, markup: /\bgtag\(\s*['"]config['"]/ },
  { name: 'Google Tag Manager', category: 'tag-manager', asset: /googletagmanager\.com\/gtm\.js/, markup: /googletagmanager\.com\/ns\.html\?id=GTM-/ },
  { name: 'Matomo', category: 'analytics', asset: /\/(?:matomo|piwik)\.js/, markup: /_paq\.push\(/ },
  { name: 'Plausible', category: 'analytics', asset: /plausible\.io\/js\// },
  { name: 'Fathom', category: 'analytics', asset: /cdn\.usefathom\.com\// },
  { name: 'Hotjar', category: 'analytics', asset: /static\.hotjar\.com\//, markup: /\bhjid\s*:/ },
  { name: 'Segment', category: 'analytics', asset: /cdn\.segment\.com\/analytics\.js/ },
  { name: 'Microsoft Clarity', category: 'analytics', asset: /clarity\.ms\/tag\// },
  { name: 'Meta Pixel', category: 'analytics', asset: /connect\.facebook\.net\/[^/]+\/fbevents\.js/, markup: /\bfbq\(\s*['"]init['"]/ },
  { name: 'Vercel Analytics', category: 'analytics', asset: /\/_vercel\/insights\/script\.js/ },
  // CDN, hosting, servers
  { name: 'Cloudflare', category: 'cdn', headers: { server: /^cloudflare/i, 'cf-ray': /./ } },
  { name: 'Fastly', category: 'cdn', headers: { 'x-served-by': /cache-/i, 'x-fastly-request-id': /./ } },
  { name: 'Akamai', category: 'cdn', headers: { server: /AkamaiGHost/i, 'x-akamai-transformed': /./ } },
  { name: 'Amazon CloudFront', category: 'cdn', headers: { via: /CloudFront/i, 'x-amz-cf-id': /./ } },
  { name: 'Vercel', category: 'hosting', headers: { server: /^Vercel$/i, 'x-vercel-id': /./ } },
  { name: 'Netlify', category: 'hosting', headers: { server: /^Netlify/i, 'x-nf-request-id': /./ } },
  { name: 'GitHub Pages', category: 'hosting', headers: { server: /^GitHub\.com$/i } },
  { name: 'Heroku', category: 'hosting', headers: { via: /vegur/i } },
  { name: 'nginx', category: 'server', headers: { server: /^nginx/i } },
  { name: 'Apache', category: 'server', headers: { server: /^Apache/i } },
  { name: 'Microsoft IIS', category: 'server', headers: { server: /Microsoft-IIS/i } },
  { name: 'LiteSpeed', category: 'server', headers: { server: /^LiteSpeed/i } },
  { name: 'Caddy', category: 'server', headers: { server: /^Caddy/i } },
  { name: 'PHP', category: 'language', headers: { 'x-powered-by': /^PHP/i }, cookie: /^PHPSESSID$/ },
  // Other
  { name: 'OneTrust', category: 'consent', asset: /cdn\.cookielaw\.org\// },
  { name: 'Cookiebot', category: 'consent', asset: /consent\.cookiebot\.com\// },
  { name: 'Didomi', category: 'consent', asset: /sdk\.privacy-center\.org\// },
  { name: 'Stripe', category: 'payment', asset: /js\.stripe\.com\// },
  { name: 'PayPal', category: 'payment', asset: /paypal\.com\/sdk\/js/ },
  { name: 'Google Fonts', category: 'font', asset: /fonts\.googleapis\.com\// },
  { name: 'Adobe Fonts', category: 'font', asset: /use\.typekit\.net\// },
  { name: 'Intercom', category: 'chat', asset: /widget\.intercom\.io\// },
  { name: 'Crisp', category: 'chat', asset: /client\.crisp\.chat\// },
  { name: 'Zendesk', category: 'chat', asset: /static\.zdassets\.com\// },
  { name: 'HubSpot', category: 'analytics', asset: /js\.hs-scripts\.com\/|js\.hsforms\.net\// },
];

const clip = (value: string): string => (value.length > 120 ? `${value.slice(0, 117)}…` : value);

/**
 * Detects the technologies visible in a document and its response headers.
 *
 * @param headers - Response headers, lower-cased names.
 * @param cookieNames - Names of the cookies the answer sets.
 */
export function detectTechnologies(
  html: string,
  headers: Readonly<Record<string, string>>,
  cookieNames: readonly string[] = [],
): TechDetection[] {
  const $ = load(html);
  const generators = $('meta[name="generator" i]')
    .toArray()
    .map((node) => ($(node).attr('content') ?? '').trim())
    .filter((value) => value !== '');
  const assets = $('script[src], link[href]')
    .toArray()
    .slice(0, 500)
    .map((node) => $(node).attr('src') ?? $(node).attr('href') ?? '');

  const detections: TechDetection[] = [];
  for (const signature of SIGNATURES) {
    let evidence: string | null = null;
    for (const [name, pattern] of Object.entries(signature.headers ?? {})) {
      const value = headers[name];
      if (value !== undefined && pattern.test(value)) evidence ??= `header ${name}: ${clip(value)}`;
    }
    if (evidence === null && signature.generator !== undefined) {
      const hit = generators.find((value) => signature.generator?.test(value) === true);
      if (hit !== undefined) evidence = `meta generator: ${clip(hit)}`;
    }
    if (evidence === null && signature.asset !== undefined) {
      const hit = assets.find((value) => signature.asset?.test(value) === true);
      if (hit !== undefined) evidence = `asset: ${clip(hit)}`;
    }
    if (evidence === null && signature.cookie !== undefined) {
      const hit = cookieNames.find((value) => signature.cookie?.test(value) === true);
      if (hit !== undefined) evidence = `cookie: ${clip(hit)}`;
    }
    if (evidence === null && signature.markup !== undefined) {
      const hit = html.match(signature.markup)?.[0];
      if (hit !== undefined) evidence = `markup: ${clip(hit)}`;
    }
    if (evidence !== null) {
      detections.push({ name: signature.name, category: signature.category, evidence });
    }
  }
  return detections;
}
