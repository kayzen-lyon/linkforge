# Astro example

> **En bref (FR)** — Un composant Astro qui récupère les métadonnées côté serveur et produit une carte en HTML pur (zéro JavaScript), plus l'élément `<link-preview>` hydraté dans le navigateur.

Two ways to show a link in Astro:

| File | What it shows |
| --- | --- |
| [`src/components/LinkCard.astro`](src/components/LinkCard.astro) | The metadata is fetched in the component's frontmatter (at build time, or per request with an SSR adapter) and rendered as plain HTML. **No JavaScript is sent.** A link that cannot be previewed falls back to a plain link instead of failing the build. |
| [`src/pages/index.astro`](src/pages/index.astro) | The same page also uses the `<link-preview>` custom element, registered by a bundled `<script>`. |

## Run it

```bash
cd examples/astro
npm install
npm run dev
```

Until `@omnillink/sdk` is published, point the dependency at this repository instead (`"@omnillink/sdk": "file:../../packages/sdk"`) after `npm run build -w @omnillink/sdk`.

## Configuration

Set these in `.env` (see [Astro's environment variables](https://docs.astro.build/en/guides/environment-variables/)):

| Variable | Default | |
| --- | --- | --- |
| `OMNILLINK_URL` | the public demo instance | Origin of your Omnillink instance. |
| `OMNILLINK_API_KEY` | — | Read in the frontmatter only, so it stays on the server. Do not give it a `PUBLIC_` name. |

## Notes

- Astro escapes `{expressions}`, which is what you want for third-party metadata. Do not use `set:html` with it.
- `<link-preview>` calls the instance from the browser, without a key. For a key-protected instance, use the server-rendered `LinkCard`.
- Importing `@omnillink/sdk/element` is safe during the build: without a DOM it registers nothing.
