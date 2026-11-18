/**
 * Computes the WCAG 2.x contrast ratio of every text/background and
 * component/background pair the site actually uses, in both themes and in the
 * "higher contrast" mode, straight from the tokens of src/style.css.
 *
 * Usage: node scripts/contrast.mjs            (exits 1 when a pair is under its threshold)
 * Thresholds: 4.5 for text, 3 for large text (≥ 24 px, or ≥ 18.66 px bold),
 * UI component boundaries and focus indicators.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Selector not found: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Parses `hsl(h s% l%)` or `hsl(h s% l% / a)` into { rgb, alpha }. */
function parse(value) {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+))?\s*\)/.exec(value);
  if (m === null) throw new Error(`Cannot parse colour: ${value}`);
  return { rgb: hslToRgb(+m[1], +m[2], +m[3]), alpha: m[4] === undefined ? 1 : +m[4] };
}

const over = (top, bottom) => top.rgb.map((c, i) => c * top.alpha + bottom[i] * (1 - top.alpha));
const mix = (a, b, share) => a.map((c, i) => c * share + b[i] * (1 - share));

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(':root');
const themes = {
  light,
  dark: { ...light, ...block(":root[data-theme='dark']") },
  'light, higher contrast': { ...light, ...block(':root.high-contrast') },
  'dark, higher contrast': {
    ...light,
    ...block(":root[data-theme='dark']"),
    ...block(":root[data-theme='dark'].high-contrast"),
  },
  'dark, pure black': { ...light, ...block(":root[data-theme='dark']"), ...block(":root[data-theme='dark'].oled") },
};

const WHITE = 'hsl(0 0% 100%)';
const white = (alpha) => `hsl(0 0% 100% / ${alpha})`;

/** [foreground, background, minimum ratio, where it is used]. A token name or a literal colour. */
const PAIRS = [
  ['--foreground', '--background', 4.5, 'Body text, nav links, field text'],
  ['--foreground', '--sunken', 4.5, 'Text on alternate sections'],
  ['--foreground', '--card', 4.5, 'Text on cards'],
  ['--foreground', '--muted', 4.5, 'Badges, tags, table headers, selected language'],
  ['--navy', '--background', 4.5, 'Headings'],
  ['--navy', '--sunken', 4.5, 'Headings on alternate sections'],
  ['--navy', '--card', 4.5, 'Card titles, wordmark "Omnil"'],
  ['--muted-foreground', '--background', 4.5, 'Secondary text, lead paragraphs'],
  ['--muted-foreground', '--sunken', 4.5, 'Secondary text on alternate sections'],
  ['--muted-foreground', '--card', 4.5, 'Secondary text on cards, table cells'],
  ['--muted-foreground', '--muted', 4.5, 'Inactive tab and language labels'],
  ['--primary', '--background', 4.5, 'Eyebrows, links, wordmark "link", active nav'],
  ['--primary', '--sunken', 4.5, 'Eyebrows and links on alternate sections'],
  ['--primary', '--card', 4.5, 'GET verb, "required" label, step numbers'],
  ['--primary', '--primary-soft', 3, 'Icons on tinted tiles (graphics)'],
  ['--foreground', '--primary-soft', 4.5, 'Notes, pressed accessibility options'],
  ['--primary-foreground', '--primary', 4.5, 'Primary button label, skip link'],
  ['--destructive', '--background', 4.5, 'Field error text'],
  ['--destructive', '--destructive-soft', 4.5, 'Error title in the demo'],
  ['--foreground', '--destructive-soft', 4.5, 'Error text in the demo'],
  ['--muted-foreground', '--destructive-soft', 4.5, 'API message in an error'],
  ['--accent-foreground', '--accent', 4.5, 'Accessibility button icon, pipeline numbers'],
  ['--input', '--card', 3, 'Field border'],
  ['--input', '--background', 3, 'Field border on the page'],
  ['--border-strong', '--card', 3, 'Secondary button and option borders'],
  ['--border-strong', '--background', 3, 'Back-to-top border'],
  ['--ring', '--background', 3, 'Focus ring'],
  ['--ring', '--card', 3, 'Focus ring on cards'],
  ['--primary', '--muted', 3, 'Selected tab underline'],
  // Navy surfaces: banner, footer, call-to-action band, console.
  [white(0.88), '--navy-deep', 4.5, 'Top banner text'],
  ['--gold', '--navy-deep', 4.5, 'Banner link, footer titles, credit link'],
  [WHITE, '--navy-deep', 4.5, 'Footer wordmark "Omnil", band title'],
  ['--on-navy-accent', '--navy-deep', 3, 'Footer wordmark "link" (large text)'],
  [white(0.82), '--navy-deep', 4.5, 'Footer links'],
  [white(0.75), '--navy-deep', 4.5, 'Footer description'],
  [white(0.8), '--navy-deep', 4.5, 'Footer legal line'],
  [white(0.85), '--navy-deep', 4.5, 'Call-to-action band text'],
  [WHITE, '--navy-deep', 3, 'Focus ring on navy surfaces'],
  ['--code-fg', '--code-bg', 4.5, 'Code text'],
  ['--code-muted', '--code-bg', 4.5, 'Code labels, comments, punctuation'],
  ['--tok-key', '--code-bg', 4.5, 'Code: keys'],
  ['--tok-str', '--code-bg', 4.5, 'Code: strings'],
  ['--tok-num', '--code-bg', 4.5, 'Code: numbers'],
  ['--tok-kw', '--code-bg', 4.5, 'Code: keywords'],
  ['--gold', '--code-bg', 4.5, 'GET verb in the request line'],
  [WHITE, '--code-bg', 4.5, 'Copy button, selected code tab'],
  ['hsl(213 56% 14%)', '--gold', 4.5, 'GET badge in the reference'],
];

let failures = 0;
const rows = [];
for (const [name, tokens] of Object.entries(themes)) {
  const resolve = (ref) => parse(ref.startsWith('--') ? tokens[ref] : ref);
  for (const [fg, bg, minimum, use] of PAIRS) {
    const background = resolve(bg).rgb;
    const value = ratio(over(resolve(fg), background), background);
    const ok = value >= minimum;
    if (!ok) failures += 1;
    rows.push({ theme: name, use, pair: `${fg} on ${bg}`, ratio: value.toFixed(2), min: minimum, ok });
  }
  // Translucent header: text over the worst case, 72 % page colour over the other extreme.
  const page = resolve('--background').rgb;
  const worst = mix(page, resolve('--foreground').rgb, 0.72);
  const value = ratio(resolve('--foreground').rgb, worst);
  rows.push({
    theme: name,
    use: 'Header link over content showing through (worst case, before blur)',
    pair: '--foreground on 72% --background',
    ratio: value.toFixed(2),
    min: 4.5,
    ok: value >= 4.5,
  });
  if (value < 4.5) failures += 1;
}

const markdown = process.argv.includes('--markdown');
let theme = '';
for (const row of rows) {
  if (row.theme !== theme) {
    theme = row.theme;
    console.log(markdown ? `\n**${theme}**\n\n| Use | Pair | Ratio | Min | |\n|---|---|---|---|---|` : `\n== ${theme} ==`);
  }
  const mark = row.ok ? 'ok' : 'FAIL';
  console.log(
    markdown
      ? `| ${row.use} | ${row.pair} | ${row.ratio} | ${row.min} | ${mark} |`
      : `${mark.padEnd(4)} ${row.ratio.padStart(6)} (min ${row.min})  ${row.pair.padEnd(48)} ${row.use}`,
  );
}
console.log(`\n${rows.length} pairs checked, ${failures} under threshold.`);
process.exit(failures === 0 ? 0 : 1);
