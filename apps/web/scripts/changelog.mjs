/**
 * Writes src/content/changelog.snapshot.json from the git history: `feat:` and
 * `fix:` subjects only, grouped by date. The build reads git directly when the
 * full history is available and falls back to this snapshot on a shallow clone
 * (a deployment checkout), so run it before releasing:
 *
 *     node apps/web/scripts/changelog.mjs
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const log = execSync('git log --format=%cs%x09%s', { encoding: 'utf8' });
const entries = log
  .split('\n')
  .map((line) => line.split('\t'))
  .filter(([, subject]) => /^(feat|fix)(\([^)]*\))?!?: /.test(subject ?? ''))
  .map(([date, subject]) => ({ date, subject }));
writeFileSync(new URL('../src/content/changelog.snapshot.json', import.meta.url), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`${entries.length} entries`);
