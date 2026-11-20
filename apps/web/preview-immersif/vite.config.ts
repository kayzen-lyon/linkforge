/**
 * Aperçu isolé de la mise en scène « immersive » — développement uniquement.
 *
 *   npx vite --config preview-immersif/vite.config.ts      (depuis apps/web)
 *
 * Réutilise la configuration du site telle quelle (vrai menu, vraies pages, vrais textes),
 * puis retouche le HTML produit : rien n'est modifié dans `src/`, et le build de production
 * (`vite.config.ts`) ne connaît pas ce dossier.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

import { common as en } from '../src/i18n/en/common.ts';
import { common as fr } from '../src/i18n/fr/common.ts';
import { escapeHtml, inlineToHtml } from '../src/lib/inline.ts';
import { PAGES, SITE_ORIGIN, localizeHref, parsePath, type Lang, type PageId } from '../src/site/config.ts';
import { icon } from '../src/site/icons.ts';
import base from '../vite.config.ts';

type Key = keyof typeof fr;
const DICT: Readonly<Record<Lang, Readonly<Record<Key, string>>>> = { fr, en };

interface LabRun {
  readonly page: 'home' | 'playground' | 'docs';
  readonly form: 'desktop' | 'mobile';
  readonly performance: number;
  readonly accessibility: number;
  readonly bestPractices: number;
  readonly seo: number;
}
const LAB = JSON.parse(readFileSync(new URL('../src/content/lighthouse.json', import.meta.url), 'utf8')) as {
  readonly measuredOn: string;
  readonly lighthouse: string;
  readonly chrome: string;
  readonly runs: readonly LabRun[];
};

/** Remplace `html[from, to)` ; échoue bruyamment si un repère a disparu du site. */
function splice(html: string, start: string, end: string, make: (inner: string) => string): string {
  const from = html.indexOf(start);
  const to = from === -1 ? -1 : html.indexOf(end, from);
  if (from === -1 || to === -1) throw new Error(`Aperçu immersif : repère introuvable (${start.slice(0, 40)}…)`);
  return `${html.slice(0, from)}${make(html.slice(from, to))}${html.slice(to)}`;
}

function swap(html: string, find: string, put: string): string {
  if (!html.includes(find)) throw new Error(`Aperçu immersif : repère introuvable (${find.slice(0, 40)}…)`);
  return html.replace(find, put);
}

/** Cartes de preuves : capture entière de chaque page mesurée, scores Lighthouse en grand. */
function proofCards(lang: Lang): string {
  const t = (tag: string, key: Key, cls = ''): string =>
    `<${tag}${cls === '' ? '' : ` class="${cls}"`} data-i18n="${key}">${inlineToHtml(DICT[lang][key])}</${tag}>`;
  const ring = (key: Key, value: number): string =>
    `<li class="im-ring"><svg viewBox="0 0 44 44" aria-hidden="true" focusable="false"><circle class="im-ring-track" cx="22" cy="22" r="19" /><circle class="im-ring-value" cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="${value} 100" /></svg><span class="im-ring-n mono">${value}</span>${t('span', key, 'im-ring-l')}</li>`;
  const row = (run: LabRun): string =>
    `<div class="im-score-row">${t('dt', `lab.form.${run.form}`)}<dd><ul>${ring('lab.th.performance', run.performance)}${ring('lab.th.accessibility', run.accessibility)}${ring('lab.th.practices', run.bestPractices)}${ring('lab.th.seo', run.seo)}</ul></dd></div>`;
  const link: Readonly<Record<LabRun['page'], readonly [PageId, Key] | null>> = { home: null, playground: ['playground', 'nav.playground'], docs: ['docs', 'nav.docs'] };

  const cards = (['home', 'playground', 'docs'] as const).map((page) => {
    const runs = LAB.runs.filter((run) => run.page === page);
    const target = link[page];
    const path = page === 'home' ? '/' : PAGES[page];
    return `<li class="im-proof">
              <figure class="im-browser">
                <p class="im-browser-bar" aria-hidden="true"><span class="im-dots"></span><span class="mono">${escapeHtml(`${SITE_ORIGIN.replace('https://', '')}${path}`)}</span></p>
                <img src="/preview-immersif/assets/${page}.jpg" alt="" width="1280" height="720" loading="lazy" decoding="async" />
              </figure>
              <div class="im-proof-body">
                ${t('h4', `lab.page.${page}`)}
                <dl class="im-scores">${runs.map(row).join('')}</dl>
                <p class="lab-meta mono">Lighthouse ${escapeHtml(LAB.lighthouse)} · <time datetime="${escapeHtml(LAB.measuredOn)}">${escapeHtml(LAB.measuredOn)}</time></p>
                ${target === null ? '' : `<p><a class="text-link" href="${localizeHref(PAGES[target[0]], lang)}">${t('span', target[1], 'link-grow')}${icon('arrowRight', 'size-4')}</a></p>`}
              </div>
            </li>`;
  });

  return `<div class="im-proofs">
            ${t('h3', 'lab.title', 'lab-title')}
            ${t('p', 'lab.caption', 'sr-only')}
            <ol class="im-proof-list">
            ${cards.join('\n            ')}
            </ol>
            <p class="lab-meta mono">Lighthouse ${escapeHtml(LAB.lighthouse)} · Chromium ${escapeHtml(LAB.chrome)} · <time datetime="${escapeHtml(LAB.measuredOn)}">${escapeHtml(LAB.measuredOn)}</time></p>
            ${t('p', 'lab.note', 'rich lab-note')}
          </div>
        </div>
      `;
}

const STAGE = `<aside class="im-stage" aria-hidden="true">
            <div class="im-stage-frame">
              <p class="im-stage-bar"><span class="im-dots"></span><span class="im-stage-tag mono"></span><span class="im-stage-count mono"></span></p>
              <div class="im-stage-view"></div>
              <p class="im-stage-title"></p>
            </div>
          </aside>`;

function immersif(): Plugin {
  return {
    name: 'omnillink-apercu-immersif',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(source, context) {
        const { page, lang } = parsePath(context.path);
        let html = source;

        // Toutes les pages : nom de la marque en filigrane au bas du pied de page.
        html = swap(html, '</footer>', '<p class="im-filigrane" aria-hidden="true">Omnillink</p>\n    </footer>');

        if (page === 'home') {
          // 1. Premier écran : le fond décoratif devient le mur (rempli après le premier affichage).
          html = swap(html, '<div class="hero-bg" aria-hidden="true"></div>', '<div class="im-wall" aria-hidden="true" inert></div>');
          // 3. Capacités : mêmes cartes, plus une scène fixe à côté.
          html = splice(html, '<div class="cap-group"', '<p class="mt-6 text-sm text-muted-foreground"><span data-i18n="cap.captured"', (groups) => `<div class="im-caps"><div class="im-caps-list">${groups}</div>\n          ${STAGE}</div>\n          `);
          // 2. Preuves : le tableau des scores devient trois cartes (mêmes chiffres, même note).
          html = splice(html, '<div class="lab-block reveal">', '</section>', () => proofCards(lang));
          // 5. L'appel final s'ouvre en très grand, d'un seul tenant avec le pied de page.
          html = swap(html, '<section class="shell section-y" aria-labelledby="cta-title">', '<section class="im-cta" aria-labelledby="cta-title">');
        }

        html = swap(html, '</head>', '  <link rel="stylesheet" href="/preview-immersif/immersive.css" />\n  </head>');
        return swap(html, '</body>', '  <script type="module" src="/preview-immersif/immersive.ts"></script>\n  </body>');
      },
    },
  };
}

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [...(base.plugins ?? []), immersif()],
  server: { ...base.server, port: 5197, strictPort: true },
});
