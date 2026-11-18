/**
 * Serves one directory of `test/corpus` as a site, with the response headers
 * its `headers.json` declares for HTML documents.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../corpus/', import.meta.url));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

export interface CorpusSite {
  readonly origin: string;
  close(): Promise<void>;
}

/** Reads a corpus file as text. */
export function corpusFile(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

export async function serveCorpus(name: string): Promise<CorpusSite> {
  const dir = join(ROOT, name);
  const headersFile = join(dir, 'headers.json');
  const htmlHeaders = existsSync(headersFile)
    ? (JSON.parse(readFileSync(headersFile, 'utf8')) as Record<string, string>)
    : {};
  const server: Server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://corpus').pathname);
    let file = normalize(join(dir, pathname));
    if (!file.startsWith(dir) || file === headersFile) return void res.writeHead(404).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file)) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const body = type.startsWith('text/html')
      ? Buffer.from(readFileSync(file, 'utf8').replaceAll('{{ORIGIN}}', origin))
      : readFileSync(file);
    res.writeHead(200, { 'content-type': type, ...(type.startsWith('text/html') ? htmlHeaders : {}) }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
