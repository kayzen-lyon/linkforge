# Omnillink link preview — GitHub Action

> **En bref (FR)** — Action GitHub qui récupère les métadonnées d'une URL (et, si demandé, une capture d'écran) auprès d'une instance Omnillink, les expose en sorties et écrit un aperçu du lien dans le résumé du job. Aucun secret n'est journalisé.

Fetches the metadata of a URL from an [Omnillink](../../../README.md) instance, exposes it as step outputs and writes a link preview to the job summary. Optionally takes a screenshot.

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
| `url` | yes | — | Absolute `http(s)` URL of the page. |
| `base-url` | yes | — | Origin of the Omnillink instance. |
| `api-key` | no | — | API key, sent as the `x-api-key` header. Pass it from a secret. |
| `render` | no | `auto` | `auto`, `never` or `always`. |
| `screenshot` | no | `false` | `true` also takes a screenshot. |
| `device` | no | `desktop` | `desktop` or `mobile` (screenshot). |
| `full-page` | no | `false` | Capture the whole page (screenshot). |
| `summary` | no | `true` | Write the preview to the job summary. |
| `fail-on-error` | no | `true` | `false`: the step succeeds anyway, with `ok` = `false`. |
| `timeout-ms` | no | `60000` | Time allowed per request. |

## Outputs

| Output | |
| --- | --- |
| `ok` | `true` when the metadata was fetched. |
| `error-code` | Omnillink code (`EFORBIDDENURL`, `ETIMEOUT`, `ENETWORK`…) when `ok` is `false`; `EINPUT` for invalid inputs. |
| `title`, `description`, `publisher` | Empty when the page does not declare them. |
| `image` | URL of the preview image. |
| `canonical-url` | Canonical URL, falling back to the final URL after redirects. |
| `metadata` | The whole metadata object, as JSON. |
| `screenshot-path` | Path of the screenshot on the runner, for `actions/upload-artifact`. |

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

Pin the action to a commit SHA in production workflows.

## The summary

The summary shows the title, description, preview image and a table of the main fields. The screenshot is embedded only when the instance is anonymous (no `api-key`): the image is then loaded by GitHub from the instance, with a URL that never contains a key. With a key-protected instance the summary gives the path of the file instead.

## Security

- **No secret is logged.** The key is registered with `::add-mask::` first, sent only as a header, never placed in a URL, an output or the summary, and redacted from any error message that would echo it.
- **No shell.** This is a JavaScript action: `url` goes from the input to the SDK as data. It is never interpolated into a command, so a URL taken from an issue or a pull request cannot inject one. In your own steps, do the same: pass outputs through `env:` rather than `${{ }}` inside `run:`, as in the examples above.
- **Outputs and logs cannot be forged by the page.** Outputs use the delimiter form of `GITHUB_OUTPUT` with a random delimiter. Page metadata is never printed to the log (where a line starting with `::` is a command), and everything written to the summary is escaped: no HTML, no Markdown, no `@mention`, and only `http(s)` URLs become links or images.
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
