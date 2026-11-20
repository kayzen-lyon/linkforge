// Captures 16/9 des trois pages mesurées par Lighthouse, prises sur le site en ligne
// avec le Chrome installé sur la machine. Usage : node preview-immersif/capture.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const ORIGIN = 'https://omnillink.kayzen-lyon.com';
const PAGES = { home: '/', playground: '/playground', docs: '/docs' };
const out = fileURLToPath(new URL('./assets/', import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce', colorScheme: 'light' });
// Bandeau d'annonce fermé : la capture montre la page, pas l'annonce.
await context.addInitScript(() => localStorage.setItem('omnillink-banner', 'closed'));
for (const [name, path] of Object.entries(PAGES)) {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}${name}.jpg`, type: 'jpeg', quality: 72 });
  await page.close();
  console.log(`ok ${name}`);
}
await browser.close();
