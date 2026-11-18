# Next.js example (App Router)

> **En bref (FR)** — Trois façons d'utiliser Omnillink dans Next.js : côté serveur avec le SDK, côté navigateur avec `@omnillink/react`, et via une route qui garde la clé d'API sur le serveur.

Three ways to use Omnillink in a Next.js app, each in a few lines:

| File | What it shows |
| --- | --- |
| [`app/page.tsx`](app/page.tsx) | A Server Component that awaits `createClient().meta()`: the metadata ships as HTML. |
| [`app/components/link-card.tsx`](app/components/link-card.tsx) | Client Components: `<LinkPreview>` (the drop-in card) and `useLinkMeta()` (your own markup). |
| [`app/api/preview/route.ts`](app/api/preview/route.ts) | A route handler that proxies `/meta`, so the API key never reaches the browser. |

## Run it

```bash
cd examples/nextjs
npm install
npm run dev
```

Until `@omnillink/sdk` and `@omnillink/react` are published, point the two dependencies at this repository instead (`"@omnillink/sdk": "file:../../packages/sdk"`, `"@omnillink/react": "file:../../packages/react"`) after building them (`npm run build -w @omnillink/sdk -w @omnillink/react`).

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `OMNILLINK_URL` | the public demo instance | Origin of your Omnillink instance. |
| `OMNILLINK_API_KEY` | — | Used by the server only (`page.tsx`, `route.ts`). Do not give it a `NEXT_PUBLIC_` name. |

## Notes

- `<LinkPreview>` and `useLinkMeta()` call the instance **from the browser**, without a key: they need an instance that accepts anonymous requests from your origin. With a key-protected instance, fetch on the server (`page.tsx`) or go through your own route (`route.ts`).
- `<LinkPreview>` renders a plain link on the server and upgrades in the browser, so there is nothing to wrap in `dynamic(..., { ssr: false })`.
- Metadata is third-party text. React escapes it; never pass it to `dangerouslySetInnerHTML`.
