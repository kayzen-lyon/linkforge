# Omnillink link preview — GitHub Action

> **En bref (FR)** — Action GitHub à deux modes. `preview` (défaut) : récupère les métadonnées d'une URL (et, si demandé, une capture d'écran) auprès d'une instance Omnillink, les expose en sorties et écrit un aperçu du lien dans le résumé du job. `check-links` : vérifie une liste d'URL (statut, redirections, certificat) et écrit un tableau dans le résumé ; l'étape échoue si un lien est cassé. Aucun secret n'est journalisé.

Two modes, one action, against an [Omnillink](../../../README.md) instance:

- **`preview`** (default): fetches the metadata of a URL, exposes it as step outputs and writes a link preview to the job summary. Optionally takes a screenshot.
- **`check-links`**: checks a list of URLs (final status, redirects, TLS certificate) and writes a table to the job summary. The step fails when a link is broken.

```yaml
- uses: kayzen-lyon/linkforge/.github/actions/link-preview@main
  id: preview
  with:
    url: https://github.com
    base-url: https://links.example.com
- run: echo "$TITLE"
  env:
    TITLE: ${{ steps.preview.outputs.title }}
```

## Inputs

| Input | Required | Default | |
| --- | --- | --- | --- |
| `mode` | no | `preview` | `preview` or `check-links`. |
| `url` | in `preview` mode | — | Absolute `http(s)` URL of the page. |
| `urls` | in `check-links` mode | — | The URLs to check, one per line: 100 at most; blank lines and lines starting with `#` are skipped, duplicates are checked once. |
| `base-url` | yes | — | Origin of the Omnillink instance. |
| `api-key` | no | — | API key, sent as the `x-api-key` header. Pass it from a secret. |
| `render` | no | `auto` | `auto`, `never` or `always` (`preview`). |
| `screenshot` | no | `false` | `true` also takes a screenshot (`preview`). |
| `device` | no | `desktop` | `desktop` or `mobile` (screenshot). |
| `full-page` | no | `false` | Capture the whole page (screenshot). |
| `summary` | no | `true` | Write the preview, or the table, to the job summary. |
| `fail-on-error` | no | `true` | `false`: the step succeeds anyway, with `ok` = `false`. In `check-links` mode a broken link counts as an error. |
| `timeout-ms` | no | `60000` | Time allowed per request. |

## Outputs

| Output | |
| --- | --- |
| `ok` | `true` when the metadata was fetched (`preview`), or when every link works (`check-links`). |
| `error-code` | Omnillink code (`EFORBIDDENURL`, `ETIMEOUT`, `EBLOCKED`, `ENETWORK`…) when `ok` is `false`; `EINPUT` for invalid inputs. In `check-links` mode: the code of the first check that could not be made, or `EBROKENLINK` when every check was made and a link answered with an HTTP error. |
| `title`, `description`, `publisher` | Empty when the page does not declare them. |
| `image` | URL of the preview image. |
| `canonical-url` | Canonical URL, falling back to the final URL after redirects. |
| `metadata` | The whole metadata object, as JSON. |
| `screenshot-path` | Path of the screenshot on the runner, for `actions/upload-artifact`. |
| `checked-count`, `broken-count` | `check-links`: links checked, and links that are broken (final status 400 or above) or could not be checked. |
| `results` | `check-links`: JSON array, one item per URL in input order: `{ url, ok, status, finalUrl, redirects, error }`. `error` is an Omnillink code when the check could not be made; `status`, `finalUrl` and `redirects` are then `null`. |

## Examples

A manually triggered preview, with the screenshot kept as an artifact:

```yaml
name: Link preview
on:
  workflow_dispatch:
    inputs:
      url:
        description: Page to preview
        required: true

permissions: {}

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: kayzen-lyon/linkforge/.github/actions/link-preview@main
        id: preview
        with:
          url: ${{ inputs.url }}
          base-url: ${{ vars.OMNILLINK_URL }}
          api-key: ${{ secrets.OMNILLINK_API_KEY }}
          screenshot: true

      - uses: actions/upload-artifact@v4
        if: steps.preview.outputs.screenshot-path != ''
        with:
          name: screenshot
          path: ${{ steps.preview.outputs.screenshot-path }}
```

Do not fail the job when a link is down:

```yaml
- uses: kayzen-lyon/linkforge/.github/actions/link-preview@main
  id: preview
  with:
    url: ${{ inputs.url }}
    base-url: ${{ vars.OMNILLINK_URL }}
    fail-on-error: false
- if: steps.preview.outputs.ok != 'true'
  run: echo "No preview ($CODE)"
  env:
    CODE: ${{ steps.preview.outputs.error-code }}
```

Check the links of a release, every Monday:

```yaml
name: Link check
on:
  schedule:
    - cron: '17 6 * * 1'

permissions: {}

jobs:
  links:
    runs-on: ubuntu-latest
    steps:
      - uses: kayzen-lyon/linkforge/.github/actions/link-preview@main
        id: links
        with:
          mode: check-links
          base-url: ${{ vars.OMNILLINK_URL }}
          api-key: ${{ secrets.OMNILLINK_API_KEY }}
          urls: |
            https://example.com/
            https://example.com/docs
            # the old address must keep redirecting
            http://example.com/old-docs
      - if: failure()
        run: echo "$BROKEN link(s) broken"
        env:
          BROKEN: ${{ steps.links.outputs.broken-count }}
```

Pin the action to a commit SHA in production workflows.

## The summary

The summary shows the title, description, preview image and a table of the main fields. The screenshot is embedded only when the instance is anonymous (no `api-key`): the image is then loaded by GitHub from the instance, with a URL that never contains a key. With a key-protected instance the summary gives the path of the file instead.

In `check-links` mode the summary is one table: a verdict, the URL, the final status, the number of redirects, the final URL when it differs, and the days left on the TLS certificate. A check that could not be made (refused address, unreachable host, quota) shows its Omnillink code instead. Links are checked four at a time, without downloading any body; a redirect is not a failure. One check is one request against the quota of the instance.

## Security

- **No secret is logged.** The key is registered with `::add-mask::` first, sent only as a header, never placed in a URL, an output or the summary, and redacted from any error message that would echo it.
- **No shell.** This is a JavaScript action: `url` goes from the input to the SDK as data. It is never interpolated into a command, so a URL taken from an issue or a pull request cannot inject one. In your own steps, do the same: pass outputs through `env:` rather than `${{ }}` inside `run:`, as in the examples above.
- **Outputs and logs cannot be forged by the page.** Outputs use the delimiter form of `GITHUB_OUTPUT` with a random delimiter. Page metadata is never printed to the log (where a line starting with `::` is a command), and everything written to the summary is escaped: no HTML, no Markdown, no `@mention`, and only `http(s)` URLs become links or images. The same holds for `check-links`: redirect targets are escaped, and the log only ever carries counts, never a checked URL.
- The screenshot file name is built from an allow-list of characters, inside `RUNNER_TEMP`.
- The action needs no token and no permission.

## How it is built

`action.yml` runs `dist/index.mjs` (Node 24), a single file bundled from [`src/`](src) with the [`@omnillink/sdk`](../../../packages/sdk) client inside; there is no other dependency. `dist/` is committed, as JavaScript actions require.

```bash
npm run build -w @omnillink/sdk            # from the repository root
cd .github/actions/link-preview
npm run typecheck
npm test                                   # rebuilds dist/, then runs it against a stub API
```

After changing `src/`, run `npm run build` and commit `dist/index.mjs`.
