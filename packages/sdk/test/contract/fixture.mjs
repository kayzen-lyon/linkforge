/**
 * A small site for the contract check: pages with JSON-LD, a table, an oEmbed
 * link, icons, a sitemap, a redirect and a block page. No dependency.
 *
 *   node test/contract/fixture.mjs [port]      (default 4311, bound to 127.0.0.1)
 */
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';

// ---- a tiny PNG encoder (8-bit RGB), so that /image, /palette and /favicon have real files ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** `pixel(x, y)` returns `[r, g, b]`. */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) raw.set(pixel(x, y), row + 1 + x * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BLUE = [20, 88, 159];
const SAND = [242, 233, 220];
const RED = [192, 57, 43];
// 60 % blue, 30 % sand, 10 % red: a palette with a known order.
const COVER = png(120, 63, (x) => (x < 72 ? BLUE : x < 108 ? SAND : RED));
const ICON = png(32, 32, (x, y) => ((x + y) % 2 === 0 ? BLUE : SAND));
const APPLE = png(180, 180, () => BLUE);

// ---- pages ----------------------------------------------------------------------------------

const jsonLd = (value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;

function home(origin) {
  const article = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: 'The tide tables were wrong by eleven minutes',
    description: 'A new sensor shows high water arriving earlier than the printed tables predicted.',
    author: { '@type': 'Person', name: 'Amara Okafor', url: `${origin}/authors/amara` },
    publisher: { '@type': 'Organization', name: 'Estuary Gazette', logo: { '@type': 'ImageObject', url: `${origin}/apple.png` } },
    datePublished: '2026-03-14T07:30:00Z',
    dateModified: '2026-03-15T09:00:00Z',
    image: `${origin}/cover.png`,
    articleSection: 'Harbour',
    keywords: ['tides', 'harbour'],
    inLanguage: 'en-GB',
    wordCount: 240,
    isAccessibleForFree: true,
    mainEntityOfPage: `${origin}/`,
  };
  const paragraph =
    'The tide tables for the estuary were first printed in 1867 and have been reprinted every year since, with small corrections. ' +
    'This spring a new pressure sensor on the harbour wall showed that high water arrives eleven minutes earlier than predicted. ';
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>The tide tables were wrong by eleven minutes</title>
<meta name="description" content="A new sensor shows high water arriving earlier than the printed tables predicted.">
<meta name="author" content="Amara Okafor">
<meta name="keywords" content="tides, harbour">
<meta name="theme-color" content="#0d1117">
<meta name="robots" content="index, follow">
<meta name="generator" content="WordPress 6.5.2">
<link rel="canonical" href="${origin}/">
<meta property="og:type" content="article">
<meta property="og:title" content="The tide tables were wrong by eleven minutes">
<meta property="og:site_name" content="Estuary Gazette">
<meta property="og:image" content="${origin}/cover.png">
<meta property="og:image:width" content="120">
<meta property="og:image:height" content="63">
<meta property="og:image:alt" content="The tide gauge">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@estuarygazette">
<link rel="alternate" hreflang="fr-FR" href="${origin}/fr">
<link rel="alternate" type="application/rss+xml" title="Estuary Gazette" href="/feed.xml">
<link rel="alternate" type="application/json+oembed" href="${origin}/oembed?format=json&amp;url=${encodeURIComponent(`${origin}/`)}" title="oEmbed">
<link rel="icon" type="image/png" sizes="32x32" href="/icon.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
${jsonLd(article)}
</head>
<body>
<header><nav><a href="/product">Kettle</a> <a href="/recipe">Recipe</a> <a href="/event">Event</a></nav></header>
<main>
<article>
<h1>The tide tables were wrong by eleven minutes</h1>
<p>${paragraph}See the <a href="https://data.example.org/tides">open data portal</a> and the <a href="/product#reviews" rel="nofollow noopener">sponsored kettle</a>.</p>
<p>${paragraph.repeat(4)}</p>
<img src="/cover.png" alt="The tide gauge" width="120" height="63">
<table id="prices">
<caption>Plans</caption>
<thead><tr><th>Plan</th><th>Price</th><th>Requests</th></tr></thead>
<tbody>
<tr><td>Free</td><td>€0</td><td>1,000</td></tr>
<tr><td>Pro</td><td>€19</td><td>50,000</td></tr>
<tr><td>=SUM(A1:A2)</td><td colspan="2">formula-like cell</td></tr>
</tbody>
</table>
</article>
</main>
<footer><a href="https://partner.example.org/" rel="sponsored">Partner</a></footer>
</body>
</html>`;
}

function product(origin) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pour-Over Kettle 0.9 L</title>
<link rel="canonical" href="${origin}/product">
${jsonLd({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Pour-Over Kettle 0.9 L',
  description: 'Gooseneck kettle with a built-in thermometer.',
  brand: { '@type': 'Brand', name: 'Kettlewell' },
  sku: 'KW-090-BS',
  gtin13: '4006381333931',
  image: `${origin}/cover.png`,
  offers: {
    '@type': 'Offer',
    price: '64.00',
    priceCurrency: 'EUR',
    availability: 'https://schema.org/InStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: 'Northfold' },
    url: `${origin}/product`,
  },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.7', reviewCount: '212' },
})}
</head><body><h1>Pour-Over Kettle 0.9 L</h1><p class="price">€64.00</p><p>Gooseneck kettle with a built-in thermometer.</p></body></html>`;
}

function recipe(origin) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Harbour chowder</title>
${jsonLd({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Harbour chowder',
  description: 'A thick fish soup for cold tides.',
  author: { '@type': 'Person', name: 'Amara Okafor' },
  image: `${origin}/cover.png`,
  datePublished: '2026-02-01',
  prepTime: 'PT15M',
  cookTime: 'PT35M',
  totalTime: 'PT50M',
  recipeYield: '4 servings',
  recipeCategory: 'Soup',
  recipeCuisine: 'British',
  nutrition: { '@type': 'NutritionInformation', calories: '420 kcal' },
  recipeIngredient: ['500 g white fish', '2 potatoes', '1 leek'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Sweat the leek.' },
    { '@type': 'HowToStep', text: 'Add potatoes and stock, simmer 20 minutes.' },
    { '@type': 'HowToStep', text: 'Add the fish, cook 5 minutes.' },
  ],
  keywords: 'soup, fish',
  aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.5, ratingCount: 31 },
})}
</head><body><h1>Harbour chowder</h1><p>A thick fish soup for cold tides.</p></body></html>`;
}

function event(origin) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Spring tide walk</title>
${jsonLd({
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'Spring tide walk',
  description: 'A guided walk along the sea wall at the highest tide of the year.',
  startDate: '2027-03-21T06:30:00+00:00',
  endDate: '2027-03-21T09:00:00+00:00',
  eventStatus: 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  location: {
    '@type': 'Place',
    name: 'Harbour office',
    address: { '@type': 'PostalAddress', streetAddress: '1 Quay Road', addressLocality: 'Port Elsin', postalCode: 'PE1 2AB', addressCountry: 'GB' },
  },
  image: `${origin}/cover.png`,
  organizer: { '@type': 'Organization', name: 'Estuary Gazette' },
  performer: [{ '@type': 'Person', name: 'Amara Okafor' }],
  offers: { '@type': 'Offer', price: '5', priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: `${origin}/event` },
  url: `${origin}/event`,
})}
</head><body><h1>Spring tide walk</h1><p>A guided walk along the sea wall.</p></body></html>`;
}

const BLOCKED = `<!doctype html><html><head><title>Just a moment...</title></head>
<body><script>window._cf_chl_opt={cvId:'3'};</script><div id="challenge-running"></div></body></html>`;

// ---- server ---------------------------------------------------------------------------------

export function startFixture(port = 4311) {
  const server = createServer((request, response) => {
    const origin = `http://${request.headers.host}`;
    const url = new URL(request.url ?? '/', origin);
    const send = (status, type, body, headers = {}) => {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
      response.writeHead(status, { 'content-type': type, 'content-length': buffer.length, server: 'nginx/1.24.0', ...headers });
      response.end(request.method === 'HEAD' ? undefined : buffer);
    };
    const html = (body) => send(200, 'text/html; charset=utf-8', body);

    switch (url.pathname) {
      case '/':
        return html(home(origin));
      case '/product':
        return html(product(origin));
      case '/recipe':
        return html(recipe(origin));
      case '/event':
        return html(event(origin));
      case '/plain':
        return html('<!doctype html><html><head><title>Plain</title></head><body><p>No icon, no image, no table, no oEmbed.</p></body></html>');
      case '/blocked':
        return html(BLOCKED);
      case '/old':
        return send(301, 'text/plain', 'moved', { location: `${origin}/hop` });
      case '/hop':
        return send(302, 'text/plain', 'found', { location: `${origin}/` });
      case '/gone':
        return send(404, 'text/html', '<h1>Not found</h1>');
      case '/cover.png':
        return send(200, 'image/png', COVER);
      case '/icon.png':
        return send(200, 'image/png', ICON);
      case '/apple.png':
        return send(200, 'image/png', APPLE);
      case '/oembed':
        return send(
          200,
          'application/json',
          JSON.stringify({
            version: '1.0',
            type: 'rich',
            title: 'The tide tables were wrong by eleven minutes',
            author_name: 'Amara Okafor',
            author_url: `${origin}/authors/amara`,
            provider_name: 'Estuary Gazette',
            provider_url: `${origin}/`,
            thumbnail_url: `${origin}/cover.png`,
            thumbnail_width: 120,
            thumbnail_height: 63,
            width: 600,
            height: 200,
            html: '<blockquote>The tide tables were wrong.</blockquote><script>alert("untrusted")</script>',
            cache_age: 3600,
          }),
        );
      case '/robots.txt':
        return send(200, 'text/plain', `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
      case '/sitemap.xml':
        return send(
          200,
          'application/xml',
          `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/sitemap-pages.xml</loc></sitemap><sitemap><loc>${origin}/sitemap-missing.xml</loc></sitemap></sitemapindex>`,
        );
      case '/sitemap-pages.xml':
        return send(
          200,
          'application/xml',
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><lastmod>2026-11-02</lastmod></url><url><loc>${origin}/product</loc></url><url><loc>${origin}/recipe</loc></url><url><loc>${origin}/event</loc></url></urlset>`,
        );
      default:
        return send(404, 'text/html', '<h1>Not found</h1>');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 4311);
  await startFixture(port);
  process.stdout.write(`fixture site on http://127.0.0.1:${port}\n`);
}
