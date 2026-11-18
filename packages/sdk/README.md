# @omnillink/sdk

> **En bref (FR)** — Client TypeScript minuscule et sans dépendance pour toute l'API Omnillink : métadonnées (une URL ou un lot), contenu lisible, extraction par règles CSS ou par modèle (article, produit, recette, événement), liens, tableaux, HTML rendu, technologies, mesures de chargement, vérification de lien, plans de site, image, palette, icône, oEmbed, captures d'écran, PDF, animation, QR code et image de partage. Chaque méthode est typée ; les réponses exposent aussi les en-têtes utiles (cache, identifiant de requête, quota, `etag`) et les requêtes conditionnelles (`ifNoneMatch`). Un élément `<link-preview>` prêt à poser dans une page est fourni à part. Navigateurs et Node ≥ 18. Les erreurs sont toutes des `OmnillinkError` (`code`, `status`, `message`, `retryable`). Le reste de ce document est en anglais.

A tiny, dependency-free client for the [Omnillink](../../README.md) API, and a drop-in `<link-preview>` card.

- **Client** (`@omnillink/sdk`): a typed method for every endpoint, pure URL builders, one error class. Browsers and Node ≥ 18. About 3.2 kB minified and gzipped.
- **Custom element** (`@omnillink/sdk/element`): a separate entry point, so the client stays small when you do not need the card.
- ESM only, zero runtime dependencies, ships its own type declarations.

## Install

```bash
npm install @omnillink/sdk
```

You need a running Omnillink instance; its origin is the `baseUrl` below.

## Quick start

```ts
import { createClient } from '@omnillink/sdk';

const omnillink = createClient({ baseUrl: 'https://links.example.com' });

const { data, meta, response } = await omnillink.meta('https://github.com');
console.log(data.title, data.image?.url, meta.cached, response.rateLimit?.remaining);
```

```html
<script type="module">
  import '@omnillink/sdk/element';
</script>

<link-preview url="https://github.com" base-url="https://links.example.com"></link-preview>
```

## Client

### `createClient(options)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `baseUrl` | `string` | — | Origin of the instance. `/api/v1` is appended for you; a trailing slash or an explicit `/api/v1` is tolerated. `''` means "same origin" (browsers only). |
| `apiKey` | `string` | — | Sent as the `x-api-key` header on every request. |
| `fetch` | `typeof fetch` | global `fetch` | Inject your own (tests, instrumentation, older runtimes). |
| `timeoutMs` | `number` | `30000` | Time allowed for a whole request, body included. `0` disables it. |

Every request method also accepts `signal` (an `AbortSignal`) and `timeoutMs` (overrides the client's value) next to the endpoint's own options.

### The methods at a glance

| Method | Endpoint | Resolves to |
| --- | --- | --- |
| `meta(url, options?)` | `GET /meta` | `{ data: LinkMetadata, meta, response }` |
| `metaBatch(urls, options?)` | `POST /meta/batch` | `{ data: MetaBatchItem[], meta: { succeeded, failed, durationMs }, response }` |
| `content(url, options?)` | `GET /content` | `{ data: ReadableContent, … }` |
| `contentText(url, options?)` | `GET /content?format=markdown\|text` | `{ data: string, response }` |
| `extract(url, fields, options?)` | `GET /extract?fields=…` | `{ data: ExtractData<F>, … }`, typed after the rules |
| `extractPreset(url, preset, options?)` | `GET /extract?preset=…` | `{ data: PresetData<P>, … }`, typed after the preset |
| `links(url, options?)` | `GET /links` | `{ data: LinksData, … }` |
| `tables(url, options?)` | `GET /tables` | `{ data: TablesData, … }` |
| `tablesCsv(url, options?)` | `GET /tables?format=csv` | `{ data: string, response }` |
| `html(url, options?)` | `GET /html` | `{ data: string, response }` |
| `tech(url, options?)` | `GET /tech` | `{ data: TechData, … }` |
| `insights(url, options?)` | `GET /insights` | `{ data: InsightsData, … }` |
| `check(url, options?)` | `GET /check` | `{ data: LinkCheck, meta: { durationMs }, response }` |
| `sitemap(url, options?)` | `GET /sitemap` | `{ data: SitemapData, … }` |
| `image(url, options?)` | `GET /image` | `{ data: ImageData, … }` |
| `palette(url, options?)` | `GET /palette` | `{ data: PaletteData, … }` |
| `favicon(url, options?)` | `GET /favicon` | `{ data: FaviconData, … }` |
| `oembed(url, options?)` | `GET /oembed` | `{ data: OembedData, … }` |
| `screenshot(url, options?)` | `GET /screenshot` | `Blob` (`image/png` or `image/jpeg`) |
| `pdf(url, options?)` | `GET /pdf` | `Blob` (`application/pdf`) |
| `animation(url, options?)` | `GET /animation` | `Blob` (`image/apng`) |
| `qr(url, options?)` | `GET /qr` | `Blob` (`image/svg+xml` or `image/png`) |
| `og(params)` | `GET /og` | `Blob` (`image/png` or `image/jpeg`) |

The JSON methods resolve to `{ data, meta, response }`. `meta` is the API's own `{ cached: boolean, source: 'http' | 'browser', durationMs: number }` (`check` and `metaBatch` have their own, see the table); `response` is what the response headers said, see [Response metadata](#response-metadata). Option and result types are exported under the names used above and below (`MetaOptions`, `LinksData`…). The hosted MCP endpoint (`POST /mcp`) is for agents and has no method here: see [`@omnillink/mcp`](../mcp).

Options shared by most methods:

| Option | Methods | Description |
| --- | --- | --- |
| `force`, `ttl` | every cacheable method (all but `check` and `qr`) | `force: true` bypasses the cache read; `ttl` is the cache lifetime of this answer, in seconds (60–86400). |
| `acceptLanguage`, `userAgent`, `referer` | every method that reads a page (not `metaBatch`, `image`, `palette`, `sitemap`, `check`, `qr`, `og`) | The only request headers a caller may set on the request to the target. No cookie, no `Authorization`: answers are cached by URL and shared between callers. |
| `render` | `meta`, `content`, `extract`, `links`, `tables`, `html`, `tech` | `'auto'` (plain HTTP, a browser only when needed), `'never'`, `'always'`. `html()` defaults to `'always'`. |

### `meta(url, options?)`

Rich metadata of a page.

```ts
const { data } = await omnillink.meta('https://example.com/article', {
  render: 'auto',            // 'auto' | 'never' | 'always'
  acceptLanguage: 'fr-FR',   // also userAgent, referer
  force: false,              // bypass the cache read
  ttl: 3600,                 // cache lifetime of this answer, in seconds
});

data.title;        // string | null
data.description;  // string | null
data.publisher;    // string | null
data.image;        // { url, width, height, type, alt } | null
data.favicon;      // string | null
data.feeds;        // { url, title, type }[]
data.twitter;      // { card, site }
data.alternates;   // { lang, url }[]   (hreflang)
data.paywalled;    // boolean | null
```

`data` is a `LinkMetadata`: `url`, `canonicalUrl`, `title`, `description`, `author`, `publisher`, `lang`, `date`, `dateModified`, `type`, `themeColor`, `robots`, `oembed`, `alternates`, `twitter`, `paywalled`, `domain`, `image`, `images`, `favicon`, `logo`, `video`, `audio`, `keywords`, `feeds`, `jsonLd`, `contentType`.

### `metaBatch(urls, options?)`

Metadata of up to 10 URLs in one request, over plain HTTP only (no browser). One item per URL, in input order; a URL that fails is an item, never a thrown error.

```ts
const { data, meta } = await omnillink.metaBatch(['https://github.com', 'https://example.com/404'], { ttl: 3600 });

for (const item of data) {
  if (item.status === 'success') console.log(item.url, item.data.title, item.cached);
  else console.warn(item.url, item.code, item.message); // status: 'fail' | 'error'
}
meta; // { succeeded: 1, failed: 1, durationMs: 412 }
```

The batch route has its own quota: a tenth of the caller's normal limit.

### `content(url, options?)` and `contentText(url, options?)`

The readable part of a page.

```ts
const { data } = await omnillink.content('https://example.com/blog/post', {
  mainContent: true,                 // false: the whole <body>
  include: ['article', '.lead'],     // keep only these (array or comma-separated string)
  exclude: '.newsletter',            // remove these first
  citations: true,                   // [label][1] links, numbered URLs at the end
  waitForSelector: '#comments',      // forces the browser
});

data.title;               // string | null
data.markdown;            // string
data.text;                // string
data.wordCount;           // number
data.readingTimeMinutes;  // number
data.truncated;           // true when the server cut text or markdown at its cap
data.links;               // { url, text, internal }[]
data.images;              // { url, alt }[]

// The body alone, ready for a prompt: no envelope, no JSON.
const { data: markdown } = await omnillink.contentText('https://example.com/blog/post');
const { data: text } = await omnillink.contentText('https://example.com/blog/post', { format: 'text' });
```

### `extract(url, fields, options?)`

Custom scraping: one CSS rule per field. A rule is `{ selector, attr?, type?, all? }` — `attr` is `'text'` (default), `'html'` or an attribute name; `type` is `'string'` (default), `'number'` or `'url'`; `all: true` returns every match.

```ts
const { data } = await omnillink.extract(
  'https://shop.example.com/product/42',
  {
    price: { selector: '.price', attr: 'text', type: 'number' },
    links: { selector: 'a', attr: 'href', type: 'url', all: true },
    heading: { selector: 'h1' },
  },
  { render: 'auto' },
);

data.fields.price;   // number | null
data.fields.links;   // string[]
data.fields.heading; // string | null
```

The result type follows the rules you pass: `all: true` gives an array, `type: 'number'` gives numbers, everything else is `string | null`. Rules built at run time (not literals) fall back to a union.

### `extractPreset(url, preset, options?)`

Built-in typed fields of an `'article'`, a `'product'`, a `'recipe'` or an `'event'`, read from what the page declares (schema.org JSON-LD, then microdata, Open Graph, meta tags and a few CSS fallbacks). The result type follows the preset.

```ts
const { data } = await omnillink.extractPreset('https://shop.example.com/kettle', 'product');

data.schemaType;          // 'Product' | … | null
data.fields.name;         // string | null
data.fields.price;        // number | null
data.fields.availability; // string | null   ('InStock')
data.sources.price;       // 'json-ld' | 'microdata' | 'opengraph' | 'meta' | 'css' | null
data.fields.headline;     // type error: that is a field of the article preset

const recipe = await omnillink.extractPreset(url, 'recipe');
recipe.data.fields.ingredients; // readonly string[] | null
recipe.data.fields.totalMinutes; // number | null
```

Every field is `null` when the page does not declare it, and so is its source. The field lists are in `PresetFieldMap`.

### `links(url, options?)`, `tables(url, options?)`, `tablesCsv(url, options?)`, `html(url, options?)`

```ts
const links = await omnillink.links('https://example.com', { scope: 'external', limit: 200 });
links.data.total;      // distinct links on the page, before scope and limit
links.data.links;      // { url, text, rel, internal, nofollow }[]

const tables = await omnillink.tables('https://example.com/pricing', { selector: '#prices' });
tables.data.tables[0]; // { index, caption, headers, rows, rowCount, columnCount, truncated }

const csv = await omnillink.tablesCsv('https://example.com/pricing', { table: 0 });
csv.data;              // RFC 4180 text; formula-like cells are neutralised by the server

const page = await omnillink.html('https://example.com', { waitForSelector: 'main' });
page.data;             // the serialised DOM, as a string
page.response.finalUrl; // URL after redirects
```

`html()` returns third-party markup: treat it as untrusted input and never inject it into a page as is.

### `tech(url, options?)`, `insights(url, options?)`

```ts
const tech = await omnillink.tech('https://example.com');
tech.data.technologies; // { name, category, evidence, confidence: 'high' | 'medium' | 'low', version }[]
tech.data.inspected;    // { bundles, rendered }: an absence is only as strong as this

const insights = await omnillink.insights('https://example.com', { device: 'mobile', force: true });
insights.data.network.transferBytes; // also requests, byType, thirdParty, limitReached
insights.data.timings;               // { ttfbMs, domContentLoadedMs, loadMs }
insights.data.vitals;                // { fcpMs, lcpMs, lcpElement, cls }
```

Every number of `insights()` is a **lab measurement**: one load, cold cache, no throttling, in a data-centre headless browser. Not a field score, not a Lighthouse audit.

### `check(url, options?)`, `sitemap(url, options?)`

```ts
const { data } = await omnillink.check('http://github.com');
data.ok;         // final status below 400
data.status;     // 200
data.redirects;  // [{ url, status, durationMs, location }, …] every hop, the last included
data.tls;        // { subject, issuer, validFrom, validTo, daysLeft } | null

const sitemap = await omnillink.sitemap('https://example.com', { limit: 1000 });
sitemap.data.sitemaps; // { url, kind: 'index' | 'urlset' | 'unknown', urlCount, error }[]
sitemap.data.urls;     // { url, lastmod }[]
```

`check()` is never cached and takes no `force` / `ttl`. A broken link is a result (`data.ok === false`), not a thrown error; the promise only rejects when the check itself cannot be made (`EUNREACHABLE`, `EFORBIDDENURL`…).

### `image(url, options?)`, `palette(url, options?)`, `favicon(url, options?)`, `oembed(url, options?)`

```ts
const image = await omnillink.image('https://example.com/post');   // an image, or a page: its preview image
image.data;   // { url, pageUrl, format, contentType, width, height, bytes }

const palette = await omnillink.palette('https://example.com/cover.jpg', { count: 5 });
palette.data.dominant; // '#14589f'
palette.data.colors;   // { hex, rgb: [r, g, b], population }[]

const favicon = await omnillink.favicon('https://github.com');
favicon.data.icon;     // { url, rel, declaredSizes, format, contentType, width, height, bytes }
favicon.data.icons;    // every icon measured, largest first

const embed = await omnillink.oembed('https://video.example/watch/42', { maxWidth: 640 });
embed.data.type;       // 'photo' | 'video' | 'link' | 'rich' | null
embed.data.html;       // UNTRUSTED provider markup: sandbox it (<iframe sandbox>) or sanitise it
```

A page without a preview image, a readable icon or an oEmbed link rejects with `EEMBEDNOTFOUND` (status 404).

### `screenshot(url, options?)`

Resolves to a [`Blob`](https://developer.mozilla.org/docs/Web/API/Blob) whose `type` is `image/png` or `image/jpeg`.

```ts
const blob = await omnillink.screenshot('https://example.com', {
  device: 'mobile',          // 'desktop' | 'mobile'
  fullPage: true,
  format: 'jpeg',            // 'png' | 'jpeg'
  quality: 80,               // JPEG only
  width: 390,
  height: 844,
  selector: 'main',          // capture one element
  waitFor: 500,              // extra wait, in milliseconds
  waitForSelector: '#app',   // wait until this is in the DOM
  click: 'button.tab',       // click one element first
  scrollTo: '#pricing',      // scroll one element into view
  colorScheme: 'dark',       // 'light' | 'dark'
  hide: ['.cookie-banner', '#newsletter'], // array or comma-separated string
  hideBanners: true,         // built-in cookie-banner stylesheet (default true)
  blockAds: true,            // drop well-known ad and tracking hosts
  force: false,
  ttl: 3600,
});

// A framed capture (not with fullPage): browser window or phone bezel, rounded corners, padding.
await omnillink.screenshot('https://example.com', { frame: 'browser', radius: 12, padding: 48, background: 'f4f5f7' });

// Browser
image.src = URL.createObjectURL(blob);

// Node
import { writeFile } from 'node:fs/promises';
await writeFile('shot.jpg', Buffer.from(await blob.arrayBuffer()));
```

### `pdf(url, options?)`, `animation(url, options?)`

```ts
const pdf = await omnillink.pdf('https://example.com/invoice', {
  format: 'A4',          // 'A4' | 'Letter'
  landscape: false,
  printBackground: true,
  margin: 15,            // millimetres, every side
  scale: 0.9,            // 0.1–2
  pageRanges: '1-3,5',
  headerText: '{title}', // plain text; {page} {pages} {title} {url} {date} are filled in
  footerText: 'Page {page} / {pages}',
  hideBanners: true,
  waitForSelector: '#ready',
});
await writeFile('page.pdf', Buffer.from(await pdf.arrayBuffer()));

// A short scroll-through of the page, as an animated PNG that browsers play in an <img>.
const apng = await omnillink.animation('https://example.com', { width: 800, height: 500, frames: 6, delay: 800 });
responseInfo(apng)?.animationFrames; // frames really in the file (the server has a byte budget)
```

### `qr(url, options?)`, `og(params)`

Two generators: nothing is fetched by the server.

```ts
const svg = await omnillink.qr('https://example.com');                                   // image/svg+xml
const png = await omnillink.qr('https://example.com', { format: 'png', size: 1024, ecc: 'H', color: '14589f' });

const card = await omnillink.og({
  title: 'The tide tables were wrong by eleven minutes',  // required
  description: 'A new sensor shows high water arriving early.',
  site: 'Estuary Gazette',
  author: 'Amara Okafor',
  label: 'Report',
  template: 'gradient',   // 'classic' | 'gradient' | 'split'
  theme: 'dark',          // 'light' | 'dark'
  accent: '2563eb',
  format: 'png',          // 'png' | 'jpeg'
});
```

### URL builders

These return a string and make no request, so the endpoints can go straight into `src` / `href` attributes. They take the same options as the matching method.

```ts
omnillink.screenshotUrl('https://example.com', { device: 'mobile' });
// https://links.example.com/api/v1/screenshot?url=https%3A%2F%2Fexample.com&device=mobile

omnillink.pdfUrl('https://example.com', { format: 'Letter' });
omnillink.animationUrl('https://example.com', { frames: 4 });
omnillink.qrUrl('https://example.com', { size: 256 });
omnillink.ogUrl({ title: 'Mon article', site: 'Mon site', template: 'gradient' });
// https://links.example.com/api/v1/og?title=Mon+article&site=Mon+site&template=gradient

omnillink.faviconUrl('https://github.com');
// …/api/v1/favicon?url=https%3A%2F%2Fgithub.com&redirect=true   → 302 to the best icon

omnillink.metaEmbedUrl('https://example.com', 'image.url');
// …/api/v1/meta?url=https%3A%2F%2Fexample.com&embed=image.url   → 302 to the preview image
```

```html
<img src="https://links.example.com/api/v1/qr?url=https%3A%2F%2Fexample.com&size=256" alt="QR code">
<meta property="og:image" content="https://links.example.com/api/v1/og?title=Mon+article&site=Mon+site">
```

`metaEmbedUrl(url, path)` points to `/meta` with `embed=<path>`: the server answers with a redirect to that value of the metadata (`image.url`, `favicon`, `logo.url`…), or with the value as plain text when it is not a URL (`title`).

The API key is **never** put in these URLs: a browser loading an `<img>` cannot send the `x-api-key` header, so the builders are meant for instances that accept anonymous requests.

## Response metadata

Every JSON and text result has a `response` property; for a `Blob`, call `responseInfo(blob)`.

```ts
import { createClient, responseInfo } from '@omnillink/sdk';

const result = await omnillink.links('https://example.com');
result.response;
// {
//   status: 200,
//   cache: 'HIT' | 'MISS' | null,            x-cache
//   renderSource: 'http' | 'browser' | null,  x-render-source
//   requestId: string | null,                 x-request-id: quote it when reporting a problem
//   etag: string | null,
//   rateLimit: { limit, remaining, reset } | null,   x-ratelimit-*; reset in seconds
//   finalUrl: string | null,                  html() only
//   animationFrames: number | null,           animation() only
//   qrVersion: number | null,                 qr() only
// }

const shot = await omnillink.screenshot('https://example.com');
responseInfo(shot)?.cache; // 'HIT' | 'MISS'
```

A field is `null` when the header is absent. In a browser the instance exposes these headers through CORS; a proxy in front of it may hide them.

## Conditional requests

Every JSON and text method accepts `ifNoneMatch`: pass the `etag` of a previous answer, and the promise resolves to a "not modified" outcome when your copy is still current (the server answers `304`, without a body).

```ts
const first = await omnillink.meta('https://example.com');
const etag = first.response.etag; // computed on `data`, not on timings

const again = await omnillink.meta('https://example.com', { ifNoneMatch: etag ?? undefined });
if (again.notModified) {
  // Keep using `first.data`. again.data is undefined; again.response.status is 304.
} else {
  again.data; // LinkMetadata: the page changed
}
```

The return type only becomes `OmnillinkResult<T> | NotModified` when `ifNoneMatch` is in the options: calls without it keep their plain type, so no existing code has to narrow. `check()` and `metaBatch()` are never cached and have no `etag`; the binary methods do not take `ifNoneMatch`.

## Error handling

Every failure is a `OmnillinkError` with `code`, `status` and `message`.

```ts
import { createClient, OmnillinkError } from '@omnillink/sdk';

try {
  await omnillink.meta('https://example.com');
} catch (error) {
  if (error instanceof OmnillinkError) {
    console.error(error.code, error.status, error.message, error.requestId);
    if (error.retryable) await wait((error.retryAfter ?? 5) * 1000); // then try again
  }
}
```

| Field | Description |
| --- | --- |
| `code` | An API code or a client code (below). |
| `status` | HTTP status, or `0` when no response was received. |
| `message` | Human-readable explanation. |
| `retryable` | `true` when the same request can reasonably succeed later (see the table). |
| `retryAfter` | Seconds from the `Retry-After` header, when present (the API sends it with `ERATELIMIT`). |
| `requestId` | `x-request-id` of the failed response, when there was one. |
| `cause` | The underlying error for network failures and timeouts. |

| API code | HTTP | `retryable` | Meaning |
| --- | --- | --- | --- |
| `EINVALIDPARAMS` | 400 | no | A parameter is invalid. |
| `EINVALIDURL` | 400 | no | The URL is malformed or its scheme is not supported. |
| `EUNAUTHORIZED` | 401 | no | Unknown API key. |
| `EFORBIDDENURL` | 403 | no | Destination refused by the anti-SSRF policy. |
| `EEMBEDNOTFOUND` | 404 | no | What was asked for does not exist for this URL (embed path, preview image, icon, oEmbed link, table). |
| `ESELECTORNOTFOUND` | 404 | no | No visible element matches a selector, or `waitForSelector` never appeared. |
| `ENOTHTML` | 422 | no | The target is not an HTML document. |
| `ETOOLARGE` | 422 | no | The generated file exceeds the server's limit. |
| `ERATELIMIT` | 429 | **yes** | Quota of the window used up; `retryAfter` says when it resets. |
| `EUNREACHABLE` | 502 | **yes** | DNS failure, refused connection, TLS error. |
| `ETARGETSTATUS` | 502 | no | The site itself answered with an HTTP error. |
| `EBLOCKED` | 502 | no | The site served an anti-bot page instead of its content, even to the server's browser: asking again gets the same wall. |
| `EBUSY` | 503 | **yes** | The rendering pool is full; a slot frees up within seconds. |
| `ECIRCUITOPEN` | 503 | **yes** | The target host failed repeatedly and is not contacted for a moment (30 s by default). |
| `ETIMEOUT` | 504 | **yes** | The site did not answer in time. |
| `EBROWSER`, `EINTERNAL` | 500 | no | Server-side failure. |

`code` is typed as these known codes plus `string`, so a code added by a newer server does not break your build.

Codes added by the client:

| Code | `status` | When |
| --- | --- | --- |
| `ENETWORK` | `0` | No answer at all: DNS, refused connection, CORS, offline. Retryable. |
| `ETIMEOUT` | `0` | The client's `timeoutMs` elapsed. (The server's own `ETIMEOUT` has status `504`.) Retryable. |
| `EABORTED` | `0` | Your `signal` aborted the request. |
| `EHTTP` | HTTP status | An HTTP error whose body is not an Omnillink error, e.g. a proxy's HTML page. |
| `EBADRESPONSE` | HTTP status | A successful status with a body that is not an Omnillink answer. |
| `EINVALIDURL` / `EINVALIDPARAMS` | `0` | An empty target URL or title, `fields` that is not an object, an empty batch: caught before any request. |

`isOmnillinkError(value)` is a type guard that also works when two copies of the package are loaded.

## `<link-preview>` element

```ts
import '@omnillink/sdk/element'; // registers <link-preview>
```

```html
<link-preview
  url="https://example.com/article"
  base-url="https://links.example.com"
  size="large"
  theme="auto"
></link-preview>
```

Without a bundler, the published files are plain ES modules that a browser can load directly:

```html
<script type="module" src="https://your.cdn/@omnillink/sdk/dist/element.js"></script>
```

### Attributes

| Attribute | Values | Default | Description |
| --- | --- | --- | --- |
| `url` | absolute `http(s)` URL | — | Page to preview. Anything else renders no card and makes no request. |
| `base-url` | URL | origin of the page | Origin of the Omnillink instance. |
| `size` | `compact` \| `large` | `compact` | `compact`: thumbnail beside the text. `large`: image above the text. |
| `theme` | `auto` \| `light` \| `dark` | `auto` | `auto` follows `prefers-color-scheme`. |
| `loading` | `lazy` \| `eager` | `lazy` | `lazy` waits until the card is within 200 px of the viewport. |

`url`, `baseUrl`, `size` and `theme` are also available as properties. Changing `url` or `base-url` aborts the request in flight and loads the new preview; `size` and `theme` are pure CSS and trigger no request.

The element sets a read-only `state` attribute on itself (`idle`, `loading`, `ready`, `error`), handy for styling: `link-preview[state="error"] { … }`.

### Behaviour

- **Loading**: a skeleton that is already a working link to `url`.
- **Error**: if the element has children, they are shown; otherwise a plain link to `url`. Provide your own link for a result that also works before JavaScript runs:

  ```html
  <link-preview url="https://example.com/article" base-url="https://links.example.com">
    <a href="https://example.com/article">Read the article</a>
  </link-preview>
  ```

- **Accessibility**: the card is a single link named by its publisher, title and description; images are decorative; focus is visible; animations and transitions stop under `prefers-reduced-motion`.
- **Untrusted metadata**: titles and descriptions come from arbitrary sites. The card writes them with `textContent` only, and a URL reaches `href` / `src` only if it parses as absolute `http(s)` without credentials. The link always targets *your* `url` attribute, never a URL from the response. It opens in a new tab with `rel="noopener noreferrer"`.
- **Privacy**: the preview image and icon are loaded by the visitor's browser from the third-party site (with `referrerpolicy="no-referrer"`); they are not proxied.

### Events

| Event | `detail` |
| --- | --- |
| `link-preview:load` | `{ data, meta }` — the `/meta` answer |
| `link-preview:error` | `{ error }` — usually a `OmnillinkError` |

Both bubble and cross shadow boundaries.

### CSS custom properties

Set them on the element or any ancestor. Defaults depend on the active theme.

| Property | Light default | Dark default | Purpose |
| --- | --- | --- | --- |
| `--omnillink-bg` | `#ffffff` | `#17191f` | Card background |
| `--omnillink-fg` | `#15171c` | `#eceef3` | Title and publisher |
| `--omnillink-muted` | `#5a6170` | `#9ba2b0` | Description, host, arrow |
| `--omnillink-border` | `#dde0e7` | `#2c303a` | Border and separators |
| `--omnillink-accent` | `#2d5bd7` | `#8fb0ff` | Hover, focus ring, monogram, fallback link |
| `--omnillink-media-bg` | `#eceef3` | `#21242c` | Behind the image / monogram |
| `--omnillink-skeleton` | `#e4e7ed` | `#282c35` | Skeleton blocks |
| `--omnillink-shadow` | soft two-layer shadow | `0 1px 2px rgb(0 0 0 / 0.4)` | Card shadow (`none` to remove) |
| `--omnillink-radius` | `14px` | same | Corner radius |
| `--omnillink-max-width` | `560px` | same | Maximum width of the element |
| `--omnillink-media-size` | `132px` (`92px` when the card is narrower than 360 px) | same | Thumbnail width in `compact` |
| `--omnillink-font` | system UI stack | same | Font family |
| `--omnillink-font-mono` | system monospace stack | same | Font of the host name |
| `--omnillink-font-size` | `15px` | same | Base font size |

```css
link-preview {
  --omnillink-accent: #c2410c;
  --omnillink-radius: 6px;
  --omnillink-max-width: 100%;
}
```

For deeper changes, the parts are exposed: `card`, `skeleton`, `media`, `image`, `monogram`, `body`, `source`, `icon`, `publisher`, `host`, `arrow`, `title`, `description`, `fallback`.

```css
link-preview::part(title) { font-family: Georgia, serif; }
```

### Server-side rendering

Importing `@omnillink/sdk/element` where there is no DOM does nothing and does not throw; the element is registered once the module runs in a browser.

## Development

```bash
npm run typecheck     # tsc --noEmit
npm test              # vitest, fetch mocked
npm run build         # tsc → dist/ (ESM + .d.ts)
npm run test:browser  # loads dist/ in a real Chromium (needs playwright-core and a Chromium)
npm run test:contract # calls every method against a real API and walks the answers against the types
```

### Contract check

`test/contract/contract.mjs` calls every method of the built client once, against a running API and a small fixture site (`test/contract/fixture.mjs`: pages with JSON-LD, a table, an oEmbed link, icons, a sitemap, redirects, a block page). Each answer is walked against the TypeScript type the SDK declares for it, read with the compiler API so there is no second copy of the types, and validated against the OpenAPI document of the instance. Parameters, error codes and response headers of the document are compared with the SDK too.

```bash
# In the repository root: an API allowed to reach the fixture on localhost.
npm run build -w @linkforge/api
SSRF_ALLOW_PRIVATE_NETWORKS=true SSRF_ALLOWED_PORTS='*' PORT=3411 node apps/api/dist/server.js &

npm run build -w @omnillink/sdk
npm run test:contract -w @omnillink/sdk -- --api http://127.0.0.1:3411
```

It exits 1 when a response does not match the SDK's types; disagreements between the OpenAPI document and the real responses are listed as findings for the API.

## License

MIT
