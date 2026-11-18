# @linkforge/sdk

> **En bref (FR)** — Client TypeScript minuscule et sans dépendance pour l'API LinkForge (métadonnées, captures d'écran, PDF, extraction sur mesure, contenu lisible), accompagné d'un élément `<link-preview>` prêt à poser dans une page. Fonctionne dans les navigateurs et dans Node ≥ 18. Les erreurs sont toutes des `LinkForgeError` (`code`, `status`, `message`). Le reste de ce document est en anglais.

A tiny, dependency-free client for the [LinkForge](../../README.md) API, and a drop-in `<link-preview>` card.

- **Client** (`@linkforge/sdk`): typed methods for every endpoint, pure URL builders, one error class. Browsers and Node ≥ 18.
- **Custom element** (`@linkforge/sdk/element`): a separate entry point, so the client stays small when you do not need the card.
- ESM only, zero runtime dependencies, ships its own type declarations.

## Install

```bash
npm install @linkforge/sdk
```

You need a running LinkForge instance; its origin is the `baseUrl` below.

## Quick start

```ts
import { createClient } from '@linkforge/sdk';

const linkforge = createClient({ baseUrl: 'https://links.example.com' });

const { data, meta } = await linkforge.meta('https://github.com');
console.log(data.title, data.image?.url, meta.cached);
```

```html
<script type="module">
  import '@linkforge/sdk/element';
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

The JSON methods resolve to `{ data, meta }`, where `meta` is `{ cached: boolean, source: 'http' | 'browser', durationMs: number }`.

### `meta(url, options?)`

Rich metadata of a page.

```ts
const { data } = await linkforge.meta('https://example.com/article', {
  render: 'auto', // 'auto' | 'never' | 'always'
  force: false,   // bypass the cache read
  ttl: 3600,      // cache lifetime of this answer, in seconds
});

data.title;        // string | null
data.description;  // string | null
data.publisher;    // string | null
data.image;        // { url, width, height, type, alt } | null
data.favicon;      // string | null
data.feeds;        // { url, title, type }[]
```

`data` is a `LinkMetadata`: `url`, `canonicalUrl`, `title`, `description`, `author`, `publisher`, `lang`, `date`, `image`, `images`, `favicon`, `logo`, `video`, `audio`, `keywords`, `feeds`, `jsonLd`, `contentType`.

### `extract(url, fields, options?)`

Custom scraping: one CSS rule per field. A rule is `{ selector, attr?, type?, all? }` — `attr` is `'text'` (default), `'html'` or an attribute name; `type` is `'string'` (default), `'number'` or `'url'`; `all: true` returns every match.

```ts
const { data } = await linkforge.extract(
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

### `content(url, options?)`

The readable part of a page.

```ts
const { data } = await linkforge.content('https://example.com/blog/post', { render: 'auto' });

data.title;               // string | null
data.excerpt;             // string | null
data.markdown;            // string
data.text;                // string
data.wordCount;           // number
data.readingTimeMinutes;  // number
```

### `screenshot(url, options?)`

Resolves to a [`Blob`](https://developer.mozilla.org/docs/Web/API/Blob) whose `type` is `image/png` or `image/jpeg`.

```ts
const blob = await linkforge.screenshot('https://example.com', {
  device: 'mobile',          // 'desktop' | 'mobile'
  fullPage: true,
  format: 'jpeg',            // 'png' | 'jpeg'
  quality: 80,               // JPEG only
  width: 390,
  height: 844,
  selector: 'main',          // capture one element
  waitFor: 500,
  colorScheme: 'dark',       // 'light' | 'dark'
  hide: ['.cookie-banner', '#newsletter'], // array or comma-separated string
  force: false,
  ttl: 3600,
});

// Browser
image.src = URL.createObjectURL(blob);

// Node
import { writeFile } from 'node:fs/promises';
await writeFile('shot.jpg', Buffer.from(await blob.arrayBuffer()));
```

### `pdf(url, options?)`

Resolves to a `Blob` of type `application/pdf`.

```ts
const blob = await linkforge.pdf('https://example.com/invoice', {
  format: 'A4',          // 'A4' | 'Letter'
  landscape: false,
  printBackground: true,
  force: false,
  ttl: 3600,
});
await writeFile('page.pdf', Buffer.from(await blob.arrayBuffer()));
```

### URL builders

These return a string and make no request, so the endpoints can go straight into `src` / `href` attributes. They take the same options as the matching method.

```ts
linkforge.screenshotUrl('https://example.com', { device: 'mobile' });
// https://links.example.com/api/v1/screenshot?url=https%3A%2F%2Fexample.com&device=mobile

linkforge.pdfUrl('https://example.com', { format: 'Letter' });
// https://links.example.com/api/v1/pdf?url=https%3A%2F%2Fexample.com&format=Letter

linkforge.metaEmbedUrl('https://example.com', 'image.url');
// https://links.example.com/api/v1/meta?url=https%3A%2F%2Fexample.com&embed=image.url
```

```html
<img src="https://links.example.com/api/v1/meta?url=https%3A%2F%2Fexample.com&embed=image.url" alt="">
```

`metaEmbedUrl(url, path)` points to `/meta` with `embed=<path>`: the server answers with a redirect to that value of the metadata (`image.url`, `favicon`, `logo.url`…).

The API key is **never** put in these URLs: a browser loading an `<img>` cannot send the `x-api-key` header, so the builders are meant for instances that accept anonymous requests.

## Error handling

Every failure is a `LinkForgeError` with `code`, `status` and `message`.

```ts
import { createClient, LinkForgeError } from '@linkforge/sdk';

try {
  await linkforge.meta('https://example.com');
} catch (error) {
  if (error instanceof LinkForgeError) {
    console.error(error.code, error.status, error.message);
    if (error.code === 'ERATELIMIT') await wait((error.retryAfter ?? 1) * 1000);
    if (error.retryable) { /* worth trying again later */ }
  }
}
```

| Field | Description |
| --- | --- |
| `code` | An API code or a client code (below). |
| `status` | HTTP status, or `0` when no response was received. |
| `message` | Human-readable explanation. |
| `retryAfter` | Seconds from the `Retry-After` header, when present. |
| `retryable` | `true` for `ERATELIMIT`, `EBUSY`, `ETIMEOUT`, `ENETWORK`, `EUNREACHABLE`. |
| `cause` | The underlying error for network failures and timeouts. |

API codes: `EINVALIDPARAMS`, `EINVALIDURL`, `EFORBIDDENURL`, `EUNAUTHORIZED`, `EEMBEDNOTFOUND`, `ESELECTORNOTFOUND`, `ENOTHTML`, `ETOOLARGE`, `ERATELIMIT`, `EUNREACHABLE`, `ETARGETSTATUS`, `EBUSY`, `ETIMEOUT`, `EBROWSER`, `EINTERNAL`.

Codes added by the client:

| Code | `status` | When |
| --- | --- | --- |
| `ENETWORK` | `0` | No answer at all: DNS, refused connection, CORS, offline. |
| `ETIMEOUT` | `0` | The client's `timeoutMs` elapsed. (The server's own `ETIMEOUT` has status `504`.) |
| `EABORTED` | `0` | Your `signal` aborted the request. |
| `EHTTP` | HTTP status | An HTTP error whose body is not a LinkForge error, e.g. a proxy's HTML page. |
| `EBADRESPONSE` | HTTP status | A successful status with a body that is not a LinkForge answer. |
| `EINVALIDURL` / `EINVALIDPARAMS` | `0` | An empty target URL, or `fields` that is not an object, caught before any request. |

`isLinkForgeError(value)` is a type guard that also works when two copies of the package are loaded.

## `<link-preview>` element

```ts
import '@linkforge/sdk/element'; // registers <link-preview>
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
<script type="module" src="https://your.cdn/@linkforge/sdk/dist/element.js"></script>
```

### Attributes

| Attribute | Values | Default | Description |
| --- | --- | --- | --- |
| `url` | absolute `http(s)` URL | — | Page to preview. Anything else renders no card and makes no request. |
| `base-url` | URL | origin of the page | Origin of the LinkForge instance. |
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
| `link-preview:error` | `{ error }` — usually a `LinkForgeError` |

Both bubble and cross shadow boundaries.

### CSS custom properties

Set them on the element or any ancestor. Defaults depend on the active theme.

| Property | Light default | Dark default | Purpose |
| --- | --- | --- | --- |
| `--lp-bg` | `#ffffff` | `#17191f` | Card background |
| `--lp-fg` | `#15171c` | `#eceef3` | Title and publisher |
| `--lp-muted` | `#5a6170` | `#9ba2b0` | Description, host, arrow |
| `--lp-border` | `#dde0e7` | `#2c303a` | Border and separators |
| `--lp-accent` | `#2d5bd7` | `#8fb0ff` | Hover, focus ring, monogram, fallback link |
| `--lp-media-bg` | `#eceef3` | `#21242c` | Behind the image / monogram |
| `--lp-skeleton` | `#e4e7ed` | `#282c35` | Skeleton blocks |
| `--lp-shadow` | soft two-layer shadow | `0 1px 2px rgb(0 0 0 / 0.4)` | Card shadow (`none` to remove) |
| `--lp-radius` | `14px` | same | Corner radius |
| `--lp-max-width` | `560px` | same | Maximum width of the element |
| `--lp-media-size` | `132px` (`92px` when the card is narrower than 360 px) | same | Thumbnail width in `compact` |
| `--lp-font` | system UI stack | same | Font family |
| `--lp-font-mono` | system monospace stack | same | Font of the host name |
| `--lp-font-size` | `15px` | same | Base font size |

```css
link-preview {
  --lp-accent: #c2410c;
  --lp-radius: 6px;
  --lp-max-width: 100%;
}
```

For deeper changes, the parts are exposed: `card`, `skeleton`, `media`, `image`, `monogram`, `body`, `source`, `icon`, `publisher`, `host`, `arrow`, `title`, `description`, `fallback`.

```css
link-preview::part(title) { font-family: Georgia, serif; }
```

### Server-side rendering

Importing `@linkforge/sdk/element` where there is no DOM does nothing and does not throw; the element is registered once the module runs in a browser.

## Development

```bash
npm run typecheck     # tsc --noEmit
npm test              # vitest, fetch mocked
npm run build         # tsc → dist/ (ESM + .d.ts)
npm run test:browser  # loads dist/ in a real Chromium (needs playwright-core and a Chromium)
```

## License

MIT
