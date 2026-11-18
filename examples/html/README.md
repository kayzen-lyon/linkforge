# Plain HTML example

> **En bref (FR)** — Une page HTML sans outil de build : l'élément `<link-preview>` et le client sont chargés directement depuis le SDK compilé du dépôt.

One static page, no bundler: the `<link-preview>` custom element and the typed client are loaded as ES modules from the built SDK of this repository.

## Run it

From the root of the repository:

```bash
npm run build -w @omnillink/sdk     # produces packages/sdk/dist
python3 -m http.server 8080         # or any static server: npx serve -l 8080 .
```

Open `http://localhost:8080/examples/html/`. The page must be served over HTTP: browsers do not load ES modules from `file://`.

It talks to the public demo instance by default. To use your own:

```
http://localhost:8080/examples/html/?api=http://localhost:3000
```

## What it shows

- `<link-preview url base-url>` with the `size`, `theme` and `loading` attributes.
- A custom fallback (the element's children), shown before JavaScript runs and when a preview fails.
- The `link-preview:load` event, which bubbles.
- `createClient({ baseUrl }).meta(url)` and `OmnillinkError` from the same build.

In your own project, replace the relative paths with the package:

```html
<script type="module">
  import '@omnillink/sdk/element';
</script>
```
