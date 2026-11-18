/**
 * A stand-in for the Omnillink API: same routes, same envelopes, canned
 * answers chosen by the host of the target URL.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  readonly path: string;
  readonly endpoint: string;
  readonly query: URLSearchParams;
  readonly headers: IncomingMessage['headers'];
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
    requests.push({ path: request.url ?? '', endpoint, query: parsed.searchParams, headers: request.headers });
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
      response.writeHead(status, { 'content-type': type, ...headers });
      response.end(body);
    };
    const fail = (status: number, code: string, message: string, headers?: Record<string, string>): void =>
      send(status, 'application/json', JSON.stringify({ status: 'fail', code, message }), headers);

    let host = '';
    try {
      host = new URL(target).hostname;
    } catch {
      return fail(400, 'EINVALIDURL', 'The url is not a valid absolute URL');
    }

    const answer = (): void => {
      if (host === 'forbidden.test') return fail(403, 'EFORBIDDENURL', 'Destination refused by the SSRF policy');
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
            }),
          );
        }
        case 'extract': {
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
