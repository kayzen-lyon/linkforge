# Examples

> **En bref (FR)** — Trois intégrations minimales d'Omnillink : une page HTML sans build, une application Next.js et un composant Astro.

Minimal integrations of [Omnillink](../README.md). Each folder has its own README.

| Example | Stack | Shows |
| --- | --- | --- |
| [`html/`](html) | One static page, no build step | `<link-preview>`, the client and its URL builders (QR code, site icon), loaded from the built SDK |
| [`nextjs/`](nextjs) | Next.js App Router | Server Component, `@omnillink/react` (card, hooks, `<QrCode>`, `og:image` URL), a route that hides the API key |
| [`astro/`](astro) | Astro | A zero-JavaScript server-rendered card with the site icon, and the custom element |

They all default to the public demo instance, `https://omnillink.kayzen-lyon.com`; set `OMNILLINK_URL` (or `?api=` for the HTML page) to use your own.
