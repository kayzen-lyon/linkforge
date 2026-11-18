# @omnillink/cli

> **En bref (FR)** — La commande `omnillink` : toute l'API Omnillink depuis le terminal. Vingt commandes — métadonnées (`meta`, `batch`), contenu (`content`, `html`), extraction (`extract`, `tables`, `links`), inspection d'un site (`tech`, `insights`, `check`, `sitemap`, `image`, `palette`, `favicon`, `oembed`) et fichiers (`shot`, `pdf`, `animation`, `qr`, `og`). Sortie lisible par défaut (tableau des technologies, chaîne de redirections, pastilles de couleur, QR code dessiné dans le terminal), JSON avec `--json`, fichier avec `-o`, liste d'URL sur l'entrée standard avec parallélisme borné, codes de sortie distincts pour les erreurs d'usage, d'API et de réseau. Aucune dépendance en dehors de `@omnillink/sdk`. Le reste de ce document est en anglais.

The [Omnillink](../../README.md) link-intelligence API from your terminal.

```console
$ omnillink tech https://example.com
https://example.com/
  Technology       Category  Confidence  Evidence
  WordPress 6.5.2  cms       ●●● high    meta generator: WordPress 6.5.2
  nginx 1.24.0     server    ●●● high    header server: nginx/1.24.0
  2 technologies · 0 bundles read · not rendered
  http · 84 ms · fresh

$ omnillink check http://example.com/old
✓ 200  https://example.com/  2 redirects
  ├─ 301  http://example.com/old  41 ms
  ├─ 302  https://example.com/old  18 ms
  └─ 200  https://example.com/  118 ms
  Type    text/html
  Length  4.4 kB
  TLS     example.com · Let's Encrypt · expires 2026-12-30 (42 days left)
  Time    177 ms
```

- A command for every endpoint of the API: twenty of them.
- Human-readable by default, one JSON record per URL with `--json`, a file with `-o`.
- Reads a list of URLs from standard input, with bounded concurrency and results in input order.
- Exit codes tell usage errors, API errors and network errors apart.
- No runtime dependency other than [`@omnillink/sdk`](../sdk); the argument parser is hand-rolled. Node ≥ 20.

## Install

```bash
npm install -g @omnillink/cli     # then: omnillink --help
npx @omnillink/cli meta https://github.com
```

## Configuration

| Flag | Environment | Default | |
| --- | --- | --- | --- |
| `--base-url <url>` | `OMNILLINK_URL` | `https://omnillink.kayzen-lyon.com` (public demo) | Origin of the Omnillink instance. |
| `--api-key <key>` | `OMNILLINK_API_KEY` | — | Sent as the `x-api-key` header. Prefer the variable: arguments are visible in `ps`. |

The key is never printed, never put in a URL, and redacted from any error message that would echo it. Because a key belongs to one instance, the CLI refuses to run with a key and no explicit instance rather than send it to the public default.

## Commands

Every command takes one or more URLs, or a list on standard input (`og` takes titles). `omnillink <command> --help` lists every flag; the tables below give the ones specific to each command.

| | Command | Endpoint | Prints |
| --- | --- | --- | --- |
| Read a page | `meta` | `GET /meta` | A summary of the metadata. |
| | `batch` | `POST /meta/batch` | One line per URL, ten URLs per request. |
| | `content` | `GET /content` | The Markdown (or text) of the page, and nothing else. |
| | `extract` | `GET /extract` | The fields of your CSS rules, or of a preset. |
| | `links` | `GET /links` | The links of the page. |
| | `tables` | `GET /tables` | The tables, drawn; one of them as CSV with `--csv`. |
| | `html` | `GET /html` | The rendered HTML. |
| Inspect a site | `tech` | `GET /tech` | A table: technology, category, confidence, evidence. |
| | `insights` | `GET /insights` | Weight, requests, timings, web vitals of one load. |
| | `check` | `GET /check` | Status, redirect chain, certificate. |
| | `sitemap` | `GET /sitemap` | robots.txt, sitemap files, URLs. |
| | `image` | `GET /image` | Format, real dimensions, weight. |
| | `palette` | `GET /palette` | Dominant colours, with swatches. |
| | `favicon` | `GET /favicon` | The best icon and every icon measured. |
| | `oembed` | `GET /oembed` | The oEmbed document of the page. |
| Make a file | `shot` | `GET /screenshot` | Writes a PNG or JPEG. |
| | `pdf` | `GET /pdf` | Writes a PDF. |
| | `animation` | `GET /animation` | Writes an animated PNG. |
| | `qr` | `GET /qr` | Draws the QR code in the terminal, or writes an SVG / PNG. |
| | `og` | `GET /og` | Writes a 1200×630 social card. |

Aliases: `screenshot` (`shot`), `metadata` (`meta`), `markdown` (`content`), `meta-batch` (`batch`), `technologies` (`tech`), `icon` (`favicon`), `colors` / `colours` (`palette`), `apng` (`animation`).

Flags shared by the commands that read a page (`meta`, `content`, `extract`, `links`, `tables`, `html`, `tech`, `insights`, `favicon`, `oembed`, `shot`, `pdf`, `animation`):

| Flag | |
| --- | --- |
| `--force` | Bypass the server cache read (the fresh answer is still stored). |
| `--ttl <seconds>` | Cache lifetime of this answer, 60–86400. |
| `--accept-language <value>`, `--user-agent <value>`, `--referer <url>` | The three request headers the API lets a caller set on the request to the target. No cookie, no `Authorization`. |

`batch`, `sitemap`, `image`, `palette` and `og` take `--force` / `--ttl` only; `check` and `qr` are never cached and take neither. `--render <auto|never|always>` (headless-browser strategy) exists on `meta`, `content`, `extract`, `links`, `tables`, `html` and `tech`.

### `omnillink meta <url>...`

```console
$ omnillink meta https://example.com/blog/tide-tables
The tide tables were wrong by eleven minutes
  https://example.com/blog/tide-tables
  A new sensor shows high water arriving earlier than the printed tables predicted.

  Publisher     Estuary Gazette
  Author        Amara Okafor
  Date          2026-03-14
  Modified      2026-03-15
  Kind          article
  Language      en-GB
  Translations  fr-FR
  Image         https://example.com/img/gauge.jpg (1200×630)
  Favicon       https://example.com/favicon.ico
  Feeds         https://example.com/feed.xml
  Keywords      tides, harbour
  Twitter       summary_large_image · @estuarygazette
  Theme         #0d1117
  Robots        index, follow
  Paywall       no
  Type          text/html
  http · 63 ms · fresh
```

### `omnillink batch <url>...`

Metadata of many URLs in few requests: the URLs are sent to `POST /meta/batch` ten at a time, over plain HTTP only (the equivalent of `meta --render never`). A URL that fails is reported and does not stop the others.

```console
$ omnillink batch https://example.com/ https://example.com/product https://example.com/gone
✓ The tide tables were wrong by eleven minutes  https://example.com/
✓ Pour-Over Kettle 0.9 L  https://example.com/product  cached
✗ ETARGETSTATUS  https://example.com/gone  The target responded with HTTP 404
2 succeeded, 1 failed
```

`--json` prints one record per URL, in the shape of `meta --json` (without the response headers, which belong to the whole request). The batch route has a tenth of the normal quota, so the groups are sent one at a time unless `--concurrency` is given; a refused request fails every URL of its group with the same error.

### `omnillink content <url>...` (alias: `markdown`)

Prints the main content as Markdown, and nothing else, so it can be redirected or piped into a model.

| Flag | |
| --- | --- |
| `--text` | Plain text instead of Markdown. |
| `--no-main-content` | Keep the whole `<body>` instead of the main content. |
| `--include <css>`, `--exclude <css>` | Keep only / remove the matching elements. Repeatable, or comma-separated. |
| `--citations` | Reference-style links: `[label][1]`, the numbered URLs at the end. |
| `--wait-for-selector <css>` | Wait for this element (forces the browser). |

```bash
omnillink content https://example.com/blog/post > post.md
omnillink content https://example.com/blog/post --citations --exclude .newsletter
```

### `omnillink extract <url>... --field <rule>` or `--preset <name>`

A rule is `NAME=SELECTOR`. Modifiers go on the name, so the selector stays plain CSS:

| Rule | Meaning |
| --- | --- |
| `heading=h1` | Text of the first `h1`. |
| `price:number=.price` | Parsed as a number (`$1,299.00` → `1299`). |
| `link@href:url=a.more` | The `href` attribute, as an absolute URL. |
| `links@href:url[]=nav a` | Every match, as an array. |
| `body@html=article` | Inner HTML. |

```bash
omnillink extract https://example.com -f 'heading=h1' -f 'links@href:url[]=a'
omnillink extract https://example.com --fields '{"heading":{"selector":"h1"}}' --json
```

`--fields <json>` takes the rules as the JSON object the API expects. `--preset <article|product|recipe|event>` replaces the rules with a built-in set of typed fields, and shows where each value came from:

```console
$ omnillink extract https://shop.example.com/kettle --preset product
https://shop.example.com/kettle  product preset · schema.org Product
  name          Pour-Over Kettle 0.9 L  ← json-ld
  brand         Kettlewell  ← json-ld
  price         64  ← json-ld
  currency      EUR  ← json-ld
  availability  InStock  ← json-ld
  ratingValue   4.7  ← json-ld
  …
```

Also `--wait-for-selector <css>`.

### `omnillink links <url>...`

`--scope <all|internal|external>`, `--limit <n>` (1–2000, default 500).

```console
$ omnillink links https://example.com/
https://example.com/
  5 links · 3 internal · 2 external   (· internal, ↗ external)
  · Kettle            https://example.com/product
  · Recipe            https://example.com/recipe
  · Event             https://example.com/event
  ↗ open data portal  https://data.example.org/tides
  ↗ Partner           https://partner.example.org/ nofollow
  http · 12 ms · fresh
```

The first 60 links are shown; `--json` has them all.

### `omnillink tables <url>...`

`--selector <css>` restricts the `<table>` elements read. `--csv` prints one table as RFC 4180 CSV instead (`--table <index>`, default 0); cells a spreadsheet would run as a formula are neutralised by the server.

```console
$ omnillink tables https://example.com/pricing
https://example.com/pricing

  Table 0 — Plans  3 rows × 3 columns
  Plan        │ Price             │ Requests
  ────────────┼───────────────────┼──────────────────
  Free        │ €0                │ 1,000
  Pro         │ €19               │ 50,000
  =SUM(A1:A2) │ formula-like cell │ formula-like cell

  1 table · --csv [--table <index>] exports one
  http · 9 ms · fresh

$ omnillink tables https://example.com/pricing --csv -o plans.csv
```

Columns share the width of the terminal; the first 25 rows of each table are drawn.

### `omnillink html <url>...`

The serialised DOM after the scripts have run (`--render never`: the markup as served); `--wait-for-selector <css>`. Into a file or a pipe the markup is written as is; on a terminal, control characters are stripped. It is third-party markup: treat it as untrusted input.

### `omnillink tech <url>...` (alias: `technologies`)

The table shown at the top of this page: one row per detection, with the version when the evidence states one, a confidence level (`●●●` high, `●●○` medium, `●○○` low) and the evidence, cut to the width of the terminal. The last line says what was inspected: a technology that is not listed is not proof of absence.

### `omnillink insights <url>...`

`--device <desktop|mobile>`; `--force` measures again.

```console
$ omnillink insights https://example.com/
https://example.com/  desktop · HTTP 200 · measured 2026-11-18T16:25:37.956Z
  Lab measurement: one load, cold cache, no throttling, data-centre browser. Not a field score.

  TTFB                      6 ms
  DOMContentLoaded          17 ms
  Load                      24 ms
  First Contentful Paint    28 ms
  Largest Contentful Paint  28 ms <p>
  Cumulative Layout Shift   0
  DOM elements              61
  Requests                  2
  Transferred               5.1 kB
  Third parties             none

  Type      Requests  Bytes
  document  1         4.7 kB  ██████████████████████
  image     1         381 B   ██
  …
```

### `omnillink check <url>...`

No flag of its own but `--fail`. A broken link is a result, printed with `✗` and its status; the exit code stays `0` unless `--fail` is given, which exits with `5` when at least one link is broken.

```bash
omnillink check --fail < urls.txt
omnillink check --json < urls.txt | jq -r 'select(.data.ok | not) | .url'
```

### `omnillink sitemap <url>...`

`--limit <n>` (1–5000, default 500). Give any URL of the site, or the URL of a sitemap file.

```console
$ omnillink sitemap https://example.com/
✓ https://example.com/robots.txt  robots.txt found
  Kind     URLs  File
  index    —     https://example.com/sitemap.xml
  urlset   4     https://example.com/sitemap-pages.xml
  unknown  0     https://example.com/sitemap-missing.xml  HTTP 404

  https://example.com/  2026-11-02
  https://example.com/product
  …
  4 URLs in 3 files
```

### `omnillink image`, `palette`, `favicon`, `oembed`

```console
$ omnillink palette https://example.com/ --count 3
https://example.com/cover.png
  Page      https://example.com/
  Format    png
  Dominant  #14589f
  #14589f  rgb(20, 88, 159)   60.0 %  ██████████████
  #f2e9dc  rgb(242, 233, 220) 30.0 %  ███████
  #c0392b  rgb(192, 57, 43)   10.0 %  ██

$ omnillink favicon https://example.com/
https://example.com/apple.png  best icon of https://example.com/
  Size     Format  Declared as       Weight  URL
  180×180  png     apple-touch-icon  495 B   https://example.com/apple.png
  32×32    png     icon              110 B   https://example.com/icon.png
```

- `palette --count <2-8>`: when colours are on (a terminal, or `--color`), each line starts with a swatch painted in the colour itself (24-bit ANSI); the bar shows its share of the image.
- `image`: format, real dimensions and weight of an image, or of the preview image of a page.
- `oembed --max-width <px> --max-height <px>`: the provider's `html` is shown as text, truncated and flagged as untrusted markup.

### `omnillink shot <url>...` (alias: `screenshot`)

| Flag | |
| --- | --- |
| `--device <desktop\|mobile>` | Viewport profile. |
| `--full-page` | Capture the whole page. |
| `--format <png\|jpeg>`, `--quality <1-100>` | Image format and JPEG quality. |
| `--width <px>`, `--height <px>` | Viewport size. |
| `--selector <css>` | Capture one element. |
| `--wait-for <ms>`, `--wait-for-selector <css>` | Extra wait; wait until an element is in the DOM. |
| `--click <css>`, `--scroll-to <css>` | Click one element, scroll one into view, before the capture. |
| `--color-scheme <light\|dark>` | Emulated colour scheme. |
| `--hide <css>` | Selector to hide; repeatable or comma-separated. |
| `--no-hide-banners` | Keep the cookie / consent banners (hidden by default; nothing is clicked). |
| `--block-ads` | Drop requests to well-known advertising and tracking hosts. |
| `--frame <none\|browser\|phone>` | Device frame around the capture (not with `--full-page`). |
| `--radius <px>`, `--padding <px>`, `--background <hex>` | Rounded corners, space around, colour behind. |
| `-o, --output <file>` | Where to write the image. |
| `-d, --output-dir <dir>` | One file per URL, named after it. Required with several URLs. |

```bash
omnillink shot https://github.com -o github.png
omnillink shot https://github.com --format jpeg --quality 80 > github.jpg
omnillink shot https://github.com --frame browser --padding 48 --background f4f5f7 -o framed.png
omnillink shot --output-dir shots --device mobile < urls.txt
```

Binary data is never written to a terminal: without `--output`, the image goes to standard output only if it is a pipe or a file. The same holds for `pdf`, `animation` and `og`.

### `omnillink pdf <url>...`

`--format <A4|Letter>`, `--landscape`, `--print-background` / `--no-print-background`, `--margin <mm>` (0–50), `--scale <0.1-2>`, `--page-ranges <ranges>` (`1-3,5`), `--header-text <text>`, `--footer-text <text>` (plain text; `{page}`, `{pages}`, `{title}`, `{url}`, `{date}` are filled in), `--hide-banners`, `--block-ads`, `--wait-for-selector <css>`, and the same `--output` / `--output-dir` as `shot`.

```bash
omnillink pdf https://example.com --margin 15 --footer-text 'Page {page} / {pages}' -o example.pdf
```

### `omnillink animation <url>...` (alias: `apng`)

A short scroll-through of the page as an animated PNG, which browsers play in an `<img>`. `--width <px>` (320–1280), `--height <px>` (240–800), `--frames <2-10>`, `--delay <ms>` (100–3000), `--no-hide-banners`, `--block-ads`. The file is named `.png`; the line printed (and the `--json` record, as `frames`) says how many frames made it into the file, which can be fewer than asked when the server's byte budget is reached.

### `omnillink qr <url>...`

The URL is only encoded, never fetched. On a terminal, without `--output`, the code is drawn right there:

```console
$ omnillink qr https://example.com
█████████████████████████████
██ ▄▄▄▄▄ █▄▀▀ ▄█▄▄ █ ▄▄▄▄▄ ██
██ █   █ █▀ ▀█▀▀ ▀ █ █   █ ██
██ █▄▄▄█ █ ▀█▄█▀▄▄▄█ █▄▄▄█ ██
██▄▄▄▄▄▄▄█ ▀▄█ █ █▄█▄▄▄▄▄▄▄██
██ ██▀▄▀▄▄  █ ██  █ ▄▄  █▀▄██
██ █▀▄█ ▄▀▄▄▀ ▄▄  █ ▄ █▄ ▀███
██  ▄█▄█▄█ ▀▀█▀▄ ▀▀▄▄▄▀▄▄ ▄██
████▀█ █▄ █▄▀ ▄ ▄ ▄▄█  ▄ ▀███
██▄▄▄▄██▄█ ▄▄█▄ ▀▄ ▄▄▄ ▄▄████
██ ▄▄▄▄▄ █▄▀▄█▀█▀█ █▄█ ▀▀▀███
██ █   █ █▄▄ ▄▀▄▄█▄   ▄▄   ██
██ █▄▄▄█ ██▄▄ ▄ ▄▄▄▄ ▀▀ ▀ ███
██▄▄▄▄▄▄▄█▄▄▄█▄▄█▄█▄▄███▄▄▄██
█████████████████████████████
https://example.com
```

With colours on, the cells are painted black on white, which scans on any theme. Without (the sample above), the light modules are drawn in the terminal's foreground colour, which is right on a dark theme; `--invert` is for a light one. The modules are read back from the SVG the API draws, so no QR encoder is shipped.

| Flag | |
| --- | --- |
| `--format <svg\|png>` | Image format of the file. Default: svg. |
| `--size <px>` | Width and height of the image, 64–2048. |
| `--margin <modules>` | Quiet zone. Default: 4 in a file, 2 in the terminal. |
| `--ecc <L\|M\|Q\|H>` | Error-correction level. |
| `--fg <hex>`, `--bg <hex>` | Colour of the modules and of the background, in the file (`--color` is the global colour switch). |
| `--invert` | In the terminal: swap dark and light. |

```bash
omnillink qr https://example.com --format png --size 1024 -o qr.png
omnillink qr https://example.com > qr.svg
```

### `omnillink og <title>...`

A 1200×630 social card built from text; the argument is the title, not a URL, and nothing is fetched. `--description`, `--site`, `--author`, `--label`, `--template <classic|gradient|split>`, `--theme <light|dark>`, `--accent <hex>`, `--format <png|jpeg>`, `--force`, `--ttl`.

```bash
omnillink og 'Tide tables explained' --site 'Estuary Gazette' --template gradient -o card.png
```

## Output

- **Default**: a view made for people. Colours are on for a terminal and off when the output is piped, when [`NO_COLOR`](https://no-color.org) is set, or with `--no-color`; `--color` forces them. Tables fit the width of the terminal (100 columns when it is not known).
- **`--json`**: one record per URL, the same three shapes for every command. A single URL is pretty-printed; a batch is NDJSON, in input order.

  ```jsonc
  // Commands that answer with data. `response` is what the headers said.
  { "url": "…", "ok": true, "data": { /* as the API */ }, "meta": { "cached": false, "source": "http", "durationMs": 131 },
    "response": { "status": 200, "cache": "MISS", "renderSource": "http", "requestId": "…", "etag": "\"…\"", "rateLimit": { "limit": 60, "remaining": 57, "reset": 31 }, "finalUrl": null, "animationFrames": null, "qrVersion": null } }
  // Commands that write a file (shot, pdf, animation, qr, og).
  { "url": "…", "ok": true, "file": "/abs/shots/example.com-1a2b3c4d.png", "bytes": 48213, "type": "image/png" }
  // A failure, whatever the command.
  { "url": "…", "ok": false, "error": { "code": "EFORBIDDENURL", "status": 403, "message": "…", "retryable": false } }
  ```

  For `html` and `tables --csv`, `data` is the text itself and there is no `meta`. For `og`, `url` holds the title. A `batch` failure carries the item's `code` with `status: 0`: the batch answer has no HTTP status per URL.
- **`-o, --output <file>`** writes the result to a file instead of standard output, for every command.
- Text that comes from a page is stripped of control characters before it reaches your terminal: a page title, a technology name or a table cell cannot move your cursor or recolour your prompt.

## Batches

```bash
omnillink meta --json --concurrency 8 < urls.txt > meta.ndjson
cat urls.txt | omnillink shot --output-dir shots
omnillink content https://a.example https://b.example
```

One URL per line; blank lines and lines starting with `#` are skipped. `-c, --concurrency <n>` (default 4, at most 16) bounds the requests in flight. The list is read as a stream and results are printed in input order; a failure does not stop the batch. File names in `--output-dir` are rebuilt from `[a-z0-9.-]` plus a hash of the URL, so a hostile URL in the list cannot write outside the directory.

`omnillink batch` is the other way to go through a list: one request for ten URLs instead of ten requests, metadata only, no browser.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Unexpected failure, or a file that could not be written. |
| `2` | Usage error: unknown flag, missing URL… Nothing was requested. |
| `3` | The instance answered with an error (`EFORBIDDENURL`, `ERATELIMIT`, `ETARGETSTATUS`, `EBLOCKED`…). |
| `4` | No usable answer: connection refused, DNS, timeout. |
| `5` | `check --fail` only: every request worked, but at least one link is broken. |
| `130` | Interrupted. |

With several URLs the worst outcome wins: `1`, then `4`, then `3`, then `5`.

Mistakes get a suggestion:

```console
$ omnillink shot https://github.com --qualty 80
error: Unknown option --qualty
  Did you mean --quality?
  See `omnillink shot --help`.
```

Errors come with the API's code and a hint, on standard error:

```console
$ omnillink content https://example.com/members
✗ EBLOCKED (HTTP 502)
  The target answered with a block page instead of its content (challenge:cloudflare)
  The site served an anti-bot page instead of its content; retrying rarely helps.
```

## Other options

`--timeout <ms>` (default 60000, `0` disables), `-h, --help` (also per command), `-V, --version`.

## Programmatic use

```ts
import { run } from '@omnillink/cli';

const exitCode = await run({ argv: ['meta', 'https://github.com', '--json'], env: process.env, stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
```

## Development

```bash
npm run typecheck
npm test          # builds, then runs the unit tests and the built executable against a stub API
npm run build     # tsc → dist/
```

The stub answers with `test/recorded.json`: responses recorded from a real instance against the fixture site of the SDK's contract check, so the views are tested on real shapes.

## License

MIT
