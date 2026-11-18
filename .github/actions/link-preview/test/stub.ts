/**
 * A stand-in for the Omnillink API: same routes, same envelopes, canned
 * answers chosen by the host of the target URL.
 */
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Answers of a real instance, recorded against the fixture site of the SDK's contract check. */
export const RECORDED = JSON.parse(readFileSync(new URL('./recorded.json', import.meta.url), 'utf8')) as Record<string, unknown> & {
  readonly tablesCsv: string;
  readonly html: string;
  readonly qrSvg: string;
};

export interface RecordedRequest {
  readonly path: string;
  readonly endpoint: string;
  readonly method: string;
  readonly query: URLSearchParams;
  readonly headers: IncomingMessage['headers'];
  /** Parsed JSON body of a POST, once it has arrived. */
  body?: unknown;
}

export interface Stub {
  readonly baseUrl: string;
  readonly requests: RecordedRequest[];
  /** Highest number of requests that were in flight at the same time. */
  maxInFlight: number;
  close(): Promise<void>;
}

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
export const PDF = Buffer.from('%PDF-1.4\n%stub\n%%EOF\n');

const success = (data: unknown): string =>
  JSON.stringify({ status: 'success', data, meta: { cached: false, source: 'http', durationMs: 12 } });

const metadata = (url: string, title: string): Record<string, unknown> => ({
  url,
  canonicalUrl: url,
  title,
  description: 'A page used by the tests.',
  author: 'Ada',
  publisher: 'Example',
  lang: 'en',
  date: '2025-03-04T09:00:00.000Z',
  dateModified: '2025-03-05T10:30:00.000Z',
  type: 'article',
  themeColor: '#0d1117',
  robots: 'index, follow',
  oembed: null,
  alternates: [{ lang: 'fr-FR', url: 'https://ok.test/fr' }],
  twitter: { card: 'summary_large_image', site: '@example' },
  paywalled: false,
  domain: 'ok.test',
  image: { url: 'https://img.test/cover.png', width: 1200, height: 630, type: 'image/png', alt: null },
  images: [],
  favicon: 'https://ok.test/favicon.ico',
  logo: null,
  video: null,
  audio: null,
  keywords: ['one', 'two'],
  feeds: [{ url: 'https://ok.test/feed.xml', title: null, type: 'application/rss+xml' }],
  jsonLd: [],
  contentType: 'text/html',
});

export async function startStub(): Promise<Stub> {
  const requests: RecordedRequest[] = [];
  let inFlight = 0;
  const stub = { requests, maxInFlight: 0 } as { requests: RecordedRequest[]; maxInFlight: number };

  const server: Server = createServer((request, response) => {
    const parsed = new URL(request.url ?? '/', 'http://stub');
    const endpoint = parsed.pathname.replace('/api/v1/', '');
    const target = parsed.searchParams.get('url') ?? '';
    const recorded: RecordedRequest = { path: request.url ?? '', endpoint, method: request.method ?? 'GET', query: parsed.searchParams, headers: request.headers };
    requests.push(recorded);
    inFlight += 1;
    stub.maxInFlight = Math.max(stub.maxInFlight, inFlight);

    let counted = true;
    const settle = (): void => {
      if (counted) inFlight -= 1;
      counted = false;
    };
    // A client that gave up (timeout) no longer counts as in flight.
    response.on('close', settle);
    const send = (status: number, type: string, body: string | Buffer, headers: Record<string, string> = {}): void => {
      settle();
      response.writeHead(status, { 'content-type': type, 'x-request-id': 'req-stub', 'x-cache': 'MISS', ...headers });
      response.end(body);
    };
    const fail = (status: number, code: string, message: string, headers?: Record<string, string>): void =>
      send(status, 'application/json', JSON.stringify({ status: 'fail', code, message }), headers);

    if (endpoint === 'meta/batch') {
      let raw = '';
      request.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
      request.on('end', () => {
        const body = JSON.parse(raw) as { urls: string[] };
        recorded.body = body;
        if (body.urls.some((url) => url.includes('rate.test'))) return fail(429, 'ERATELIMIT', 'Too many requests', { 'retry-after': '7' });
        const data = body.urls.map((url) =>
          url.includes('gone')
            ? { url, status: 'error', code: 'ETARGETSTATUS', message: 'The target responded with HTTP 404' }
            : { url, status: 'success', data: metadata(url, `Title of ${new URL(url).hostname}`), cached: false },
        );
        const failed = data.filter((item) => item.status !== 'success').length;
        send(200, 'application/json', JSON.stringify({ status: 'success', data, meta: { succeeded: data.length - failed, failed, durationMs: 9 } }), { 'cache-control': 'no-store' });
      });
      return;
    }
    if (endpoint === 'og') {
      return send(200, parsed.searchParams.get('format') === 'jpeg' ? 'image/jpeg' : 'image/png', PNG);
    }

    let host = '';
    try {
      host = new URL(target).hostname;
    } catch {
      return fail(400, 'EINVALIDURL', 'The url is not a valid absolute URL');
    }

    const answer = (): void => {
      if (host === 'forbidden.test') return fail(403, 'EFORBIDDENURL', 'Destination refused by the SSRF policy');
      if (host === 'blocked.test') return fail(502, 'EBLOCKED', 'The target answered with a block page instead of its content (challenge:cloudflare)');
      if (host === 'circuit.test') return fail(503, 'ECIRCUITOPEN', 'circuit.test failed repeatedly and is not contacted for now, retry in 27 s');
      if (host === 'rate.test') return fail(429, 'ERATELIMIT', 'Too many requests', { 'retry-after': '7' });
      if (host === 'proxy.test') return send(502, 'text/html', '<h1>Bad gateway</h1>');
      if (host === 'echo-key.test') {
        return fail(401, 'EUNAUTHORIZED', `Unknown key ${String(request.headers['x-api-key'])}`);
      }
      switch (endpoint) {
        case 'meta': {
          const title = host === 'evil.test' ? 'Evil\u001b[2J\u001b[31m title\u0007' : `Title of ${host}`;
          return send(200, 'application/json', success(metadata(target, title)));
        }
        case 'content': {
          const markdown = host === 'long.test' ? `# Long\n\n${'word '.repeat(20_000)}` : `# Hello\n\nReadable **content** of ${host}.`;
          return send(
            200,
            'application/json',
            success({
              url: target,
              title: 'Hello',
              lang: 'en',
              excerpt: 'Readable content.',
              text: `Hello\n\nReadable content of ${host}.`,
              markdown,
              wordCount: 5,
              readingTimeMinutes: 1,
              truncated: false,
              links: [],
              images: [],
            }),
          );
        }
        case 'extract': {
          if (parsed.searchParams.has('preset')) return send(200, 'application/json', JSON.stringify(RECORDED['extractPreset']));
          const rules = JSON.parse(parsed.searchParams.get('fields') ?? '{}') as Record<string, { all?: boolean; type?: string }>;
          const fields = Object.fromEntries(
            Object.entries(rules).map(([name, rule]) => {
              const value = rule.type === 'number' ? 42 : `value of ${name}`;
              return [name, rule.all === true ? [value, value] : value];
            }),
          );
          return send(200, 'application/json', success({ url: target, fields }));
        }
        case 'screenshot':
          return send(200, parsed.searchParams.get('format') === 'jpeg' ? 'image/jpeg' : 'image/png', PNG);
        case 'pdf':
          return send(200, 'application/pdf', PDF);
        case 'animation':
          return send(200, 'image/apng', PNG, { 'x-animation-frames': '4' });
        case 'qr':
          if (parsed.searchParams.get('format') === 'png') return send(200, 'image/png', PNG, { 'x-qr-version': '2' });
          return send(200, 'image/svg+xml; charset=utf-8', host === 'odd.test' ? '<svg xmlns="http://www.w3.org/2000/svg"/>' : RECORDED.qrSvg, { 'x-qr-version': '2' });
        case 'html':
          return send(200, 'text/plain; charset=utf-8', RECORDED.html, { 'x-final-url': target, 'x-render-source': 'browser' });
        case 'tables':
          if (parsed.searchParams.get('format') === 'csv') return send(200, 'text/csv; charset=utf-8', RECORDED.tablesCsv);
          if (host === 'big.test') {
            const rows = Array.from({ length: 120 }, (_, index) => [`row ${index}`, String(index * 2), 'x'.repeat(30)]);
            const table = { index: 0, caption: 'Big', headers: ['Name', 'Value', 'Filler'], rows, rowCount: 120, columnCount: 3, truncated: false };
            return send(200, 'application/json', success({ url: target, total: 1, tables: [table], truncated: false }));
          }
          return send(200, 'application/json', JSON.stringify(RECORDED['tables']));
        case 'check': {
          if (host !== 'broken.test') return send(200, 'application/json', JSON.stringify(RECORDED['check']));
          const hop = { url: target, status: 404, durationMs: 12, location: null };
          const data = { url: target, finalUrl: target, ok: false, status: 404, redirects: [hop], contentType: 'text/html', contentLength: null, tls: null, durationMs: 12 };
          return send(200, 'application/json', JSON.stringify({ status: 'success', data, meta: { durationMs: 13 } }));
        }
        case 'links': {
          if (host !== 'big.test') return send(200, 'application/json', JSON.stringify(RECORDED['links']));
          // As the API does: `limit` bounds the list, `total` counts everything.
          const limit = Number(parsed.searchParams.get('limit') ?? '500');
          const links = Array.from({ length: Math.min(limit, 900) }, (_, index) => ({
            url: `https://big.test/page/${index}`,
            text: `Link number ${index}`,
            rel: [],
            internal: true,
            nofollow: false,
          }));
          return send(200, 'application/json', success({ url: target, total: 900, internal: 900, external: 0, links, truncated: limit < 900 }));
        }
        case 'tech':
        case 'insights':
        case 'image':
        case 'palette':
        case 'favicon':
        case 'oembed':
          if (host === 'plain.test') return fail(404, 'EEMBEDNOTFOUND', 'The page advertises no oEmbed endpoint');
          return send(200, 'application/json', JSON.stringify(RECORDED[endpoint]));
        case 'sitemap':
          return send(200, 'application/json', JSON.stringify(RECORDED[endpoint]));
        default:
          return fail(404, 'ENOTFOUND', 'No such route');
      }
    };

    if (host.startsWith('slow')) setTimeout(answer, 60);
    else answer();
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return Object.assign(stub, {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  });
}
