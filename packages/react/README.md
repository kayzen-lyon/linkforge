# @omnillink/react

> **En bref (FR)** — Omnillink pour React : le composant `<LinkPreview>` (la carte), les composants `<QrCode>` et `<OgImage>` (de simples `<img>` dont l'URL est construite par le SDK), et des hooks de lecture — `useLinkMeta()`, `useTech()`, `useLinkCheck()`, `usePalette()` et le générique `useOmnillink(endpoint, url)`. Tout est compatible SSR (aucun accès à `window` à l'import, aucune requête côté serveur). Les hooks partagent un même magasin : requêtes identiques mutualisées, réponse fraîche réutilisée, annulation au démontage. React ≥ 18 en dépendance de pair. Le reste de ce document est en anglais.

React bindings for [Omnillink](../../README.md): a drop-in link card, image components, and hooks over the read endpoints of the API.

```tsx
import { LinkPreview } from '@omnillink/react';

<LinkPreview url="https://github.com" baseUrl="https://links.example.com" />;
```

- **SSR-safe**: importing the package never touches `window`. On the server `<LinkPreview>` renders a plain link; in the browser it upgrades in place to the card. No `dynamic(..., { ssr: false })`, no hydration mismatch.
- **Typed** props and events; `ref` gives you the element.
- **Hooks** — `useLinkMeta()`, `useTech()`, `useLinkCheck()`, `usePalette()`, and `useOmnillink(endpoint, url)` for the other read endpoints: they abort on unmount, share identical requests and reuse fresh answers, through one store.
- **`<QrCode>` and `<OgImage>`**: plain `<img>` elements over the SDK's URL builders. No effect, no state, nothing to hydrate.
- React ≥ 18 as a peer dependency; one dependency, [`@omnillink/sdk`](../sdk). The components and hooks are client modules (`'use client'`), so they work as is in the Next.js App Router; the URL helpers (`ogImageUrl()`, `qrCodeUrl()`) are not, so they can be called from a Server Component.

## Install

```bash
npm install @omnillink/react react
```

## `<LinkPreview>`

```tsx
<LinkPreview
  url="https://example.com/article"
  baseUrl="https://links.example.com"
  size="large"
  theme="auto"
  loading="lazy"
  onLoad={({ data, meta }) => console.log(data.title, meta.cached)}
  onError={({ error }) => console.warn(error)}
  className="my-card"
/>
```

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `url` | `string` | — | Absolute `http(s)` URL. Anything else renders no card and makes no request. |
| `baseUrl` | `string` | provider, then the page's origin | Origin of the Omnillink instance. |
| `size` | `'compact' \| 'large'` | `'compact'` | Thumbnail beside the text, or image above it. |
| `theme` | `'auto' \| 'light' \| 'dark'` | `'auto'` | `auto` follows `prefers-color-scheme`. |
| `loading` | `'lazy' \| 'eager'` | `'lazy'` | `lazy` waits until the card is near the viewport. |
| `onLoad` | `(detail: { data, meta }) => void` | — | The card is displayed. |
| `onError` | `(detail: { error }) => void` | — | The preview failed; `error` is usually an `OmnillinkError`. |
| `children` | `ReactNode` | a link to `url` | Fallback: shown on the server, before the upgrade, and if the preview fails. |
| `className`, `style`, `id`, `aria-*`… | | | Forwarded to the element. |

`ref` is the underlying `LinkPreviewElement` (`ref.current.state` is `idle`, `loading`, `ready` or `error`).

Styling goes through the element's CSS custom properties and parts, documented in the [SDK](../sdk/README.md#css-custom-properties):

```tsx
<LinkPreview url={url} style={{ '--omnillink-accent': '#c2410c', '--omnillink-radius': '6px' } as React.CSSProperties} />
```

### What is rendered, and when

| Where | Markup |
| --- | --- |
| Server, and the first paint in the browser | `<link-preview url="…"><a href="…">…</a></link-preview>`: an unknown element with a link inside, which works without JavaScript. |
| After mount | The element is registered by a dynamic `import('@omnillink/sdk/element')` in an effect, upgrades in place and shows a skeleton, then the card. |
| On failure | The fallback again. |

A `url` that is not absolute `http(s)` never becomes an `href`.

## `useLinkMeta(url, options?)`

```tsx
import { useLinkMeta } from '@omnillink/react';

function LinkTitle({ url }: { url: string }) {
  const { status, data, error } = useLinkMeta(url, { baseUrl: 'https://links.example.com' });
  if (status === 'loading') return <span aria-busy="true">{url}</span>;
  if (status === 'error') return <a href={url}>{url}</a>;
  return <a href={url}>{data?.title ?? url}</a>;
}
```

Returns a discriminated union: narrow on `status` and `data` is typed.

| `status` | `data` | `meta` | `error` | `isLoading` |
| --- | --- | --- | --- | --- |
| `idle` | — | — | — | `false` |
| `loading` | — | — | — | `true` |
| `success` | `LinkMetadata` | `ResponseMeta` | — | `false` |
| `error` | — | — | `unknown` (an `OmnillinkError` in practice) | `false` |

| Option | Default | |
| --- | --- | --- |
| `baseUrl` | provider, then the page's origin | Origin of the instance. |
| `render` | — | `'auto' \| 'never' \| 'always'`. |
| `enabled` | `true` | `false` makes no request (`idle`). A `null`, `undefined` or empty `url` does the same. |
| `client` | — | Your own SDK client (custom `fetch`, timeout). Keep its identity stable. |

Behaviour:

- **Abort**: unmounting, or changing `url`, aborts the request, unless another component is still waiting for the same answer.
- **De-duplication**: components asking for the same `(instance, url, render)` share one request. A successful answer is reused for five minutes (at most 200 entries, in memory, per page load, shared by all the hooks); failures are never cached. `clearLinkMetaCache()` empties it.
- **SSR**: the first render is always `loading` (or `idle`), on the server and in the browser, and no request is made on the server. To render metadata on the server, call the SDK there (see the [Next.js example](../../examples/nextjs)).
- **StrictMode**: the double effect in development still results in a single request.
- A snapshot for one URL is never returned for another: after `url` changes you get `loading`, not stale data.

## More hooks

All of them return the same discriminated union as `useLinkMeta()`, plus `response` (what the response headers said: cache state, request id, quota left) on success, and behave the same way: abort, de-duplication, SSR, StrictMode.

```tsx
import { useLinkCheck, usePalette, useTech } from '@omnillink/react';

function LinkFacts({ url }: { url: string }) {
  const tech = useTech(url);                    // options: render, force, ttl, acceptLanguage… + baseUrl, enabled, client
  const check = useLinkCheck(url);              // options: baseUrl, enabled, client, freshMs
  const palette = usePalette(url, { count: 3 }); // an image, or a page: its preview image

  return (
    <ul>
      <li>{check.status === 'success' ? (check.data.ok ? 'Up' : `Broken (HTTP ${check.data.status})`) : '…'}</li>
      <li>{tech.status === 'success' ? tech.data.technologies.map((item) => item.name).join(', ') : '…'}</li>
      <li style={{ background: palette.data?.dominant }}>{palette.data?.dominant ?? '…'}</li>
    </ul>
  );
}
```

| Hook | Endpoint | `data` | Notes |
| --- | --- | --- | --- |
| `useTech(url, options?)` | `/tech` | `TechData` | Each technology has `evidence`, `confidence` and `version`. An absence is not proof. |
| `useLinkCheck(url, options?)` | `/check` | `LinkCheck` | A broken link is `status: 'success'` with `data.ok === false`; `error` is for the check itself failing. Components mounted together share the request, but the answer is **not** kept for a later mount (`freshMs` defaults to `0`): the point is the state of the link now. |
| `usePalette(url, options?)` | `/palette` | `PaletteData` | `dominant`, and `colors` as `{ hex, rgb, population }`. |

### `useOmnillink(endpoint, url, options?)`

The hook the others are built on, for every read endpoint: `'meta'`, `'content'`, `'links'`, `'tables'`, `'tech'`, `'insights'`, `'image'`, `'palette'`, `'favicon'`, `'oembed'`, `'sitemap'`, `'check'`. `data` and `params` are typed after the endpoint.

```tsx
import { useOmnillink } from '@omnillink/react';

function ExternalLinks({ url }: { url: string }) {
  const { status, data, error } = useOmnillink('links', url, { params: { scope: 'external', limit: 50 } });
  if (status === 'loading') return <p aria-busy="true">Loading…</p>;
  if (status !== 'success') return null;
  return (
    <ul>
      {data.links.map((link) => (
        <li key={link.url}>
          <a href={link.url} rel="noopener noreferrer">{link.text || link.url}</a>
        </li>
      ))}
    </ul>
  );
}
```

| Option | Default | |
| --- | --- | --- |
| `params` | — | Parameters of the endpoint (`render`, `scope`, `count`…), as in the SDK. Compared **by value**: an inline object does not restart the request. |
| `baseUrl`, `enabled`, `client` | | As for `useLinkMeta()`. |
| `freshMs` | `300000` (`0` for `check`) | How long an answer is reused by other mounts. |

`useTech(url, { render: 'never' })` and `useOmnillink('tech', url, { params: { render: 'never' } })` are the same request: mounted together, they make one. `clearOmnillinkCache()` forgets every remembered answer (`clearLinkMetaCache()` is the same function under its first name).

The endpoints that answer with a file (`screenshot`, `pdf`, `animation`, `qr`, `og`) and the text ones have no hook: use the SDK's URL builders in a `src` or an `href`, or the two components below. `insights` costs a full browser render on the instance for each new URL: do not mount it in a list.

## `<QrCode>` and `<OgImage>`

```tsx
import { OgImage, QrCode } from '@omnillink/react';

<QrCode url="https://example.com" size={256} alt="Scan to open example.com" />
<OgImage title="Tide tables explained" site="Estuary Gazette" template="gradient" loading="lazy" />
```

Both render one `<img>` whose `src` is exactly what the SDK's `qrUrl()` / `ogUrl()` return, on the server and in the browser alike; the browser fetches the image, so there is no request from JavaScript and no API key involved. Every other prop (`className`, `style`, `loading`, `id`, `aria-*`…) goes to the `<img>`, and `ref` is the `HTMLImageElement`.

| `<QrCode>` prop | Default | |
| --- | --- | --- |
| `url` | — | Absolute `http(s)` URL to encode (it is never fetched). Anything else renders nothing. |
| `size` | `512` | Pixel size of the generated image (64–2048), and the default `width` / `height` of the `<img>`. |
| `format` | `'svg'` | `'svg'` or `'png'`. |
| `margin`, `ecc`, `color`, `background` | API defaults | Quiet zone in modules, error-correction level (`L` `M` `Q` `H`), hexadecimal colours. |
| `alt` | `QR code of <url>` | |
| `baseUrl` | provider, then the page's origin | |

| `<OgImage>` prop | Default | |
| --- | --- | --- |
| `title` | — | Headline of the card. Empty renders nothing. It is a parameter of the image, not the `title` attribute of the element. |
| `description`, `site`, `author`, `label` | — | The other texts of the card. |
| `template`, `theme`, `accent`, `format` | API defaults | `'classic' \| 'gradient' \| 'split'`, `'light' \| 'dark'`, a hexadecimal colour, `'png' \| 'jpeg'`. |
| `alt` | the title | |
| `width`, `height` | `1200`, `630` | The size of the cards the API draws. |
| `baseUrl` | provider, then the page's origin | |

A `<meta property="og:image">` needs a URL, not an element. `ogImageUrl(baseUrl, params)` returns it, and can be called on the server:

```tsx
// app/layout.tsx (Next.js): a Server Component
import { ogImageUrl } from '@omnillink/react';

export const metadata = {
  openGraph: { images: [ogImageUrl('https://links.example.com', { title: 'Tide tables explained', site: 'Estuary Gazette' })] },
};
```

`qrCodeUrl(baseUrl, url, options?)` is its counterpart for QR codes.

## `<OmnillinkProvider>`

```tsx
import { OmnillinkProvider } from '@omnillink/react';

<OmnillinkProvider baseUrl="https://links.example.com">
  <App /> {/* every component and hook below uses this instance */}
</OmnillinkProvider>;
```

## API keys

The components and the hooks call the instance **from the browser**; anything you ship to a browser is public, so they deliberately take no API key. With a key-protected instance, fetch on the server with `@omnillink/sdk` (the key stays there), or expose a route of your own and call it; the [Next.js example](../../examples/nextjs) shows both.

## Security

Everything the hooks return is text written by third parties: titles, link texts, table cells, technology evidence, and above all the `html` of an oEmbed document, which is raw provider markup. The card writes metadata with `textContent` only (see the SDK); if you render `data` yourself, let React escape it and never pass it to `dangerouslySetInnerHTML`. URLs from `data` belong in an `href` only after you have checked they are `http(s)` (`safeHttpUrl()` is exported for that).

## Development

```bash
npm run typecheck
npm test          # SSR in plain Node, then real React + the real custom element in happy-dom
npm run build
```

## License

MIT
