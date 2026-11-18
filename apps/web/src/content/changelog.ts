/**
 * The public changelog, built from the commit history: `feat:` and `fix:`
 * subjects only, grouped by day. Work-in-progress commits never appear.
 * Build-time only (it runs git).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { l, same, type Block, type Guide } from './types.ts';

interface Entry {
  readonly date: string;
  readonly subject: string;
}

const PATTERN = /^(feat|fix)(\([^)]*\))?!?: (.+)$/;

function fromGit(): Entry[] | null {
  try {
    const options = { encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'] };
    // A shallow clone (deployment checkout) only knows the last commits: use the snapshot instead.
    if (execSync('git rev-parse --is-shallow-repository', options).trim() !== 'false') return null;
    const entries = execSync('git log --format=%cs%x09%s', options)
      .split('\n')
      .map((line) => line.split('\t'))
      .flatMap(([date, subject]) => (date !== undefined && subject !== undefined && PATTERN.test(subject) ? [{ date, subject }] : []));
    return entries.length === 0 ? null : entries;
  } catch {
    return null;
  }
}

function fromSnapshot(): Entry[] {
  try {
    return JSON.parse(readFileSync(new URL('./changelog.snapshot.json', import.meta.url), 'utf8')) as Entry[];
  } catch {
    return [];
  }
}

export function changelogGuide(): Guide {
  const entries = fromGit() ?? fromSnapshot();
  const days = new Map<string, Entry[]>();
  for (const entry of entries) days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);

  const blocks: Block[] = [];
  for (const [date, items] of days) {
    const day = new Date(`${date}T00:00:00Z`);
    const format = (locale: string): string => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(day);
    blocks.push({ kind: 'h2', id: `d-${date}`, text: l(format('fr-FR'), format('en-GB')) });
    blocks.push({
      kind: 'ul',
      lang: 'en',
      items: items.map((item) => {
        const match = PATTERN.exec(item.subject);
        const kind = match?.[1] === 'fix' ? 'fix' : 'feat';
        return same(`**${kind}** ${(match?.[3] ?? item.subject).replace(/[`[\]*]/g, '')}`);
      }),
    });
  }
  return {
    id: 'changelog',
    title: l('Journal des modifications', 'Changelog'),
    nav: l('Journal', 'Changelog'),
    description: l(
      'Les nouveautés et les corrections d’Omnillink, tirées de l’historique du dépôt : une ligne par changement livré, regroupée par date.',
      'New features and fixes in Omnillink, taken from the repository history: one line per shipped change, grouped by date.',
    ),
    lead: l(
      'Cette page est générée à partir de l’historique du dépôt. Elle ne retient que les nouveautés (`feat`) et les corrections (`fix`) ; les intitulés sont ceux des commits, en anglais.',
      'This page is generated from the repository history. It keeps new features (`feat`) and fixes (`fix`) only, in the wording of the commits.',
    ),
    blocks,
  };
}
