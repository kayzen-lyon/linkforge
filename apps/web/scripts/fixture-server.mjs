/**
 * The test page the landing-page samples are captured from.
 *
 * Builds `scripts/fixture` with Vite (a static article plus a small React
 * widget) and serves the result on 127.0.0.1:4100. `/go` answers 301 to
 * `/launch`, which answers 302 to `/`: a real redirect chain for `/check`.
 *
 *   node apps/web/scripts/fixture-server.mjs
 *   python3 apps/web/scripts/capture-samples.py     (API on :3000, see that file)
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../node_modules/.cache/fixture');
await build({ configFile: false, root: join(here, 'fixture'), logLevel: 'warn', build: { outDir: out, emptyOutDir: true } });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };
const REDIRECTS = { '/go': [301, '/launch'], '/launch': [302, '/'] };

createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const hop = REDIRECTS[path];
  if (hop !== undefined) {
    response.writeHead(hop[0], { location: hop[1], 'content-length': '0' }).end();
    return;
  }
  const file = join(out, normalize(path === '/' ? '/index.html' : path));
  if (!file.startsWith(out)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}).listen(4100, '127.0.0.1', () => console.log('fixture on http://127.0.0.1:4100/'));
