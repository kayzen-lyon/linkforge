/**
 * Lighthouse lab run of the embedded production build.
 *
 * Serve the build first (API on :3000 with the site embedded: `npm run build
 * -w @linkforge/web`, then `node scripts/embed-playground.mjs` in apps/api),
 * then:
 *
 *   CHROME_PATH=/path/to/chrome node apps/web/scripts/lighthouse.mjs [origin]
 *
 * Lighthouse is fetched by `npx` (it is not a dependency of the repository).
 * Home, playground and reference are audited with the desktop preset and with
 * the default mobile emulation; the four category scores of each run are
 * written to src/content/lighthouse.json, which the site displays as what it
 * is: a lab run on a local build, not a field measurement.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.argv[2] ?? 'http://localhost:3000';
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/content/lighthouse.json');
const work = mkdtempSync(join(tmpdir(), 'omnillink-lighthouse-'));
const PAGES = [['home', '/'], ['playground', '/playground'], ['docs', '/docs']];
const runs = [];
let version = '';
let chrome = '';

for (const [page, path] of PAGES) {
  for (const form of ['desktop', 'mobile']) {
    const file = join(work, `${page}-${form}.json`);
    let report;
    // A headless run sometimes loses its trace (NO_NAVSTART): such a run has no score and is repeated.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      execFileSync(
        'npx',
        ['--yes', 'lighthouse@12', `${origin}${path}`, ...(form === 'desktop' ? ['--preset=desktop'] : []), '--output=json', `--output-path=${file}`, '--chrome-flags=--headless=new --no-sandbox', '--quiet'],
        { stdio: 'ignore' },
      );
      report = JSON.parse(readFileSync(file, 'utf8'));
      if (report.runtimeError === undefined && Object.values(report.categories).every((category) => category.score !== null)) break;
      report = undefined;
    }
    if (report === undefined) throw new Error(`Lighthouse gave no complete report for ${page} (${form})`);
    version = report.lighthouseVersion;
    chrome = /Chrome\/([\d.]+)/.exec(report.environment.hostUserAgent)?.[1] ?? '';
    const score = (id) => Math.round(report.categories[id].score * 100);
    runs.push({ page, form, performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo') });
    console.log(page, form, runs.at(-1));
  }
}

writeFileSync(
  target,
  `${JSON.stringify({ measuredOn: new Date().toISOString().slice(0, 10), lighthouse: version, chrome, conditions: 'local production build embedded in the API, same machine, headless Chromium, one run per page, Lighthouse default throttling (simulated)', runs }, null, 2)}\n`,
);
console.log(`written ${target}`);
