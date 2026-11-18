# @omnillink/cli

> **En bref (FR)** — La commande `omnillink` : métadonnées, captures d'écran, PDF, extraction par sélecteurs CSS et contenu lisible d'une page, depuis le terminal. Sortie lisible par défaut, JSON avec `--json`, liste d'URL sur l'entrée standard avec parallélisme borné, codes de sortie distincts pour les erreurs d'usage, d'API et de réseau. Aucune dépendance en dehors de `@omnillink/sdk`. Le reste de ce document est en anglais.

The [Omnillink](../../README.md) link-intelligence API from your terminal.

```console
$ omnillink meta https://example.com/blog/link-previews
The quiet craft of link previews
  https://example.com/blog/link-previews
  A good preview tells you where a link goes before you click it.

  Publisher  Example Press
  Author     Ada Lovelace
  Date       2026-03-04
  Language   en
  Image      https://example.com/cover.png (1200×630)
  Favicon    https://example.com/favicon.ico
  Feeds      https://example.com/feed.xml
  Type       text/html
  http · 63 ms · fresh
```

- Five commands: `meta`, `shot`, `pdf`, `extract`, `content`.
- Human-readable by default, one JSON record per URL with `--json`.
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
| `--base-url <url>` | `OMNILLINK_URL` | `https://linkforge-sable.vercel.app` (public demo) | Origin of the Omnillink instance. |
| `--api-key <key>` | `OMNILLINK_API_KEY` | — | Sent as the `x-api-key` header. Prefer the variable: arguments are visible in `ps`. |

The key is never printed, never put in a URL, and redacted from any error message that would echo it. Because a key belongs to one instance, the CLI refuses to run with a key and no explicit instance rather than send it to the public default.

## Commands

Every command takes one or more URLs, or a list on standard input.

### `omnillink meta <url>...`

| Flag | |
| --- | --- |
| `--render <auto\|never\|always>` | Headless-browser strategy. |
| `--force` | Bypass the server cache read. |
| `--ttl <seconds>` | Cache lifetime of this answer. |

### `omnillink shot <url>...` (alias: `screenshot`)

| Flag | |
| --- | --- |
| `--device <desktop\|mobile>` | Viewport profile. |
| `--full-page` | Capture the whole page. |
| `--format <png\|jpeg>`, `--quality <1-100>` | Image format and JPEG quality. |
| `--width <px>`, `--height <px>` | Viewport size. |
| `--selector <css>` | Capture one element. |
| `--wait-for <ms>` | Extra wait before the capture. |
| `--color-scheme <light\|dark>` | Emulated colour scheme. |
| `--hide <css>` | Selector to hide; repeatable or comma-separated. |
| `--force`, `--ttl <seconds>` | Cache control. |
| `-o, --output <file>` | Where to write the image. |
| `-d, --output-dir <dir>` | One file per URL, named after it. Required with several URLs. |

```bash
omnillink shot https://github.com -o github.png
omnillink shot https://github.com --format jpeg --quality 80 > github.jpg
omnillink shot --output-dir shots --device mobile < urls.txt
```

Binary data is never written to a terminal: without `--output`, the image goes to standard output only if it is a pipe or a file.

### `omnillink pdf <url>...`

`--format <A4|Letter>`, `--landscape`, `--print-background` / `--no-print-background`, `--force`, `--ttl`, and the same `--output` / `--output-dir` as `shot`.

### `omnillink extract <url>... --field <rule>`

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

`--fields <json>` takes the rules as the JSON object the API expects; `--render` as for `meta`.

### `omnillink content <url>...` (alias: `markdown`)

Prints the main content as Markdown, and nothing else, so it can be redirected or piped into a model. `--text` prints plain text, `--render` as for `meta`.

```bash
omnillink content https://example.com/blog/post > post.md
```

## Output

- **Default**: a tidy summary. Colours are on for a terminal and off when the output is piped, when [`NO_COLOR`](https://no-color.org) is set, or with `--no-color`; `--color` forces them.
- **`--json`**: one record per URL. A single URL is pretty-printed; a batch is NDJSON, in input order.

  ```jsonc
  { "url": "…", "ok": true, "data": { /* as the API */ }, "meta": { "cached": false, "source": "http", "durationMs": 131 } }
  { "url": "…", "ok": true, "file": "/abs/shots/example.com-1a2b3c4d.png", "bytes": 48213, "type": "image/png" }
  { "url": "…", "ok": false, "error": { "code": "EFORBIDDENURL", "status": 403, "message": "…", "retryable": false } }
  ```

- **`-o, --output <file>`** writes the result to a file instead of standard output, for every command.
- Text that comes from a page is stripped of control characters before it reaches your terminal: a page title cannot move your cursor or recolour your prompt.

## Batches

```bash
omnillink meta --json --concurrency 8 < urls.txt > meta.ndjson
cat urls.txt | omnillink shot --output-dir shots
omnillink content https://a.example https://b.example
```

One URL per line; blank lines and lines starting with `#` are skipped. `-c, --concurrency <n>` (default 4, at most 16) bounds the requests in flight. The list is read as a stream and results are printed in input order; a failure does not stop the batch. File names in `--output-dir` are rebuilt from `[a-z0-9.-]` plus a hash of the URL, so a hostile URL in the list cannot write outside the directory.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Unexpected failure, or a file that could not be written. |
| `2` | Usage error: unknown flag, missing URL… Nothing was requested. |
| `3` | The instance answered with an error (`EFORBIDDENURL`, `ERATELIMIT`, `ETARGETSTATUS`…). |
| `4` | No usable answer: connection refused, DNS, timeout. |
| `130` | Interrupted. |

With several URLs the worst outcome wins: `1`, then `4`, then `3`.

Mistakes get a suggestion:

```console
$ omnillink shot https://github.com --qualty 80
error: Unknown option --qualty
  Did you mean --quality?
  See `omnillink shot --help`.
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

## License

MIT
