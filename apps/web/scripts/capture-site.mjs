/**
 * Captures the three pages measured by scripts/lighthouse.mjs, whole and in 16:9,
 * for the Lighthouse cards of the landing page (public/samples/site-*.webp).
 *
 * Serve the site first (the API on :3000 with the build embedded, as for
 * lighthouse.mjs), then:
 *
 *   node apps/web/scripts/capture-site.mjs [origin]
 *
 * Uses the Chrome installed on the machine (playwright-core ships no browser).
 * The page is captured at 1280 × 720 and stored at 960 × 540 in WebP, encoded
 * by the browser itself so no image library is needed.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const origin = process.argv[2] ?? 'http://localhost:3000';
const PAGES = [['home', '/'], ['playground', '/playground'], ['docs', '/docs']];
const out = fileURLToPath(new URL('../public/samples/', import.meta.url));

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce', colorScheme: 'light' });
// The announcement banner is closed: the capture shows the page, not the announcement.
await context.addInitScript(() => localStorage.setItem('omnillink-banner', 'closed'));
for (const [name, path] of PAGES) {
  const page = await context.newPage();
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
  // The hero wall is mounted when the browser is idle, then fades in.
  await page.waitForTimeout(2000);
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  const encoder = await context.newPage();
  const webp = await encoder.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const drawing = canvas.getContext('2d');
    drawing.imageSmoothingQuality = 'high';
    drawing.drawImage(image, 0, 0, 960, 540);
    return canvas.toDataURL('image/webp', 0.8).split(',')[1];
  }, png);
  writeFileSync(`${out}site-${name}.webp`, Buffer.from(webp, 'base64'));
  await encoder.close();
  await page.close();
  console.log(`site-${name}.webp`);
}
await browser.close();
