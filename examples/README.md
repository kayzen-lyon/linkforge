# Examples

> **En bref (FR)** — Trois intégrations minimales d'Omnillink : une page HTML sans build, une application Next.js et un composant Astro.

Minimal integrations of [Omnillink](../README.md). Each folder has its own README.

| Example | Stack | Shows |
| --- | --- | --- |
| [`html/`](html) | One static page, no build step | `<link-preview>` and the client, loaded from the built SDK |
| [`nextjs/`](nextjs) | Next.js App Router | Server Component, `@omnillink/react`, a route that hides the API key |
| [`astro/`](astro) | Astro | A zero-JavaScript server-rendered card, and the custom element |

They all default to the public demo instance, `https://linkforge-sable.vercel.app`; set `OMNILLINK_URL` (or `?api=` for the HTML page) to use your own.
