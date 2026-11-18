# @omnillink/react

> **En bref (FR)** — Composant `<LinkPreview>` et hook `useLinkMeta()` pour React. Le composant enveloppe l'élément `<link-preview>` de `@omnillink/sdk` avec des props typées ; il est compatible SSR (aucun accès à `window` à l'import, un simple lien côté serveur, la carte une fois dans le navigateur). Le hook annule la requête au démontage et mutualise les requêtes identiques. React ≥ 18 en dépendance de pair. Le reste de ce document est en anglais.

React bindings for [Omnillink](../../README.md): a drop-in link card and a hook for the metadata of a link.

```tsx
import { LinkPreview } from '@omnillink/react';

<LinkPreview url="https://github.com" baseUrl="https://links.example.com" />;
```

- **SSR-safe**: importing the package never touches `window`. On the server `<LinkPreview>` renders a plain link; in the browser it upgrades in place to the card. No `dynamic(..., { ssr: false })`, no hydration mismatch.
- **Typed** props and events; `ref` gives you the element.
- **`useLinkMeta()`**: aborts on unmount, shares identical requests, reuses fresh answers.
- React ≥ 18 as a peer dependency; one dependency, [`@omnillink/sdk`](../sdk). Every file starts with `'use client'`, so it works as is in the Next.js App Router.

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
- **De-duplication**: components asking for the same `(instance, url, render)` share one request. A successful answer is reused for five minutes (at most 200 entries, in memory, per page load); failures are never cached. `clearLinkMetaCache()` empties it.
- **SSR**: the first render is always `loading` (or `idle`), on the server and in the browser, and no request is made on the server. To render metadata on the server, call the SDK there (see the [Next.js example](../../examples/nextjs)).
- **StrictMode**: the double effect in development still results in a single request.
- A snapshot for one URL is never returned for another: after `url` changes you get `loading`, not stale data.

## `<OmnillinkProvider>`

```tsx
import { OmnillinkProvider } from '@omnillink/react';

<OmnillinkProvider baseUrl="https://links.example.com">
  <App /> {/* every <LinkPreview> and useLinkMeta() below uses this instance */}
</OmnillinkProvider>;
```

## API keys

Both the component and the hook call the instance **from the browser**; anything you ship to a browser is public, so they deliberately take no API key. With a key-protected instance, fetch on the server with `@omnillink/sdk` (the key stays there), or expose a route of your own and call it; the [Next.js example](../../examples/nextjs) shows both.

## Security

Metadata is text written by third parties. The card writes it with `textContent` only (see the SDK); if you render `data` yourself, let React escape it and never pass it to `dangerouslySetInnerHTML`.

## Development

```bash
npm run typecheck
npm test          # SSR in plain Node, then real React + the real custom element in happy-dom
npm run build
```

## License

MIT
