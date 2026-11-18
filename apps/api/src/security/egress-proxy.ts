/**
 * Validating forward proxy for the headless browser.
 *
 * Request interception (`browser-guard.ts`) only sees the first URL of a
 * request: Chromium follows HTTP redirects by itself and resolves DNS by
 * itself, so a public page could redirect — or re-point its DNS record — to
 * an internal address after the check. This proxy closes both holes at the
 * only place that cannot be bypassed: the TCP connection.
 *
 * Chromium is launched with this proxy as its sole route to the network
 * (loopback included, see `browser-pool.ts`). For **every connection** — each
 * redirect hop, sub-resource, iframe, XHR, WebSocket or `https` tunnel — the
 * proxy:
 *
 * 1. applies the SSRF policy to the requested `host:port`;
 * 2. resolves the name itself, once, and refuses if any address is not allowed;
 * 3. dials one of the addresses it just validated (no second resolution).
 *
 * It listens on `127.0.0.1` on an ephemeral port and requires a random
 * per-instance credential, so nothing but our own browser can relay through
 * it. `https` traffic is tunnelled untouched (`CONNECT`): TLS still runs end
 * to end between Chromium and the origin.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';

import type { ResolvedAddress, SsrfPolicy } from '../config.js';
import { findAppError } from '../lib/errors.js';
import { resolveDestination } from './ssrf.js';

export interface EgressEndpoint {
  /** `http://127.0.0.1:<port>` */
  readonly server: string;
  readonly username: string;
  readonly password: string;
}

/** Receives `host:port` of every destination the proxy refused. */
export type BlockedListener = (destination: string) => void;

/** Time allowed to open the upstream TCP connection. */
const CONNECT_TIMEOUT_MS = 10_000;
/** An idle tunnel or exchange is dropped after this long. */
const IDLE_TIMEOUT_MS = 60_000;
/** Addresses tried for one connection when the first ones do not answer. */
const MAX_DIAL_ATTEMPTS = 3;

/** Headers that describe the client↔proxy hop and must not travel upstream. */
const HOP_BY_HOP = new Set([
  'proxy-authorization',
  'proxy-connection',
  'proxy-authenticate',
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'upgrade',
]);

function splitHostPort(authority: string, defaultPort: number | null): [string, number] | null {
  const match = authority.match(/^(\[[^\]]+\]|[^:]*)(?::(\d{1,5}))?$/);
  if (match === null) return null;
  const host = match[1] ?? '';
  const port = match[2] === undefined ? defaultPort : Number(match[2]);
  return host === '' || port === null ? null : [host, port];
}

const dialHost = (address: ResolvedAddress): string => address.address;

export class EgressProxy {
  private readonly username = 'omnillink';
  private readonly password = randomBytes(24).toString('hex');
  private readonly expectedAuth: Buffer;
  private readonly listeners = new Set<BlockedListener>();
  private readonly sockets = new Set<Duplex>();
  private server: Server | null = null;
  private starting: Promise<EgressEndpoint> | null = null;

  constructor(private readonly policy: SsrfPolicy) {
    this.expectedAuth = Buffer.from(
      `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
    );
  }

  /** Starts the proxy on first use and returns how to reach it. */
  endpoint(): Promise<EgressEndpoint> {
    this.starting ??= new Promise<EgressEndpoint>((resolve, reject) => {
      const server = createServer((req, res) => void this.onRequest(req, res));
      server.on('connect', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        void this.onConnect(req, socket, head);
      });
      // No protocol upgrade is ever relayed in clear: WebSockets use CONNECT.
      server.on('upgrade', (_req, socket) => socket.destroy());
      server.on('connection', (socket) => this.track(socket));
      server.once('error', reject);
      // Loopback only, port chosen by the kernel.
      server.listen(0, '127.0.0.1', () => {
        this.server = server;
        const { port } = server.address() as AddressInfo;
        resolve({
          server: `http://127.0.0.1:${port}`,
          username: this.username,
          password: this.password,
        });
      });
    });
    return this.starting;
  }

  /** Subscribes to refusals; returns the function that unsubscribes. */
  onBlocked(listener: BlockedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stops listening and drops every open tunnel. Idempotent. */
  async close(): Promise<void> {
    const server = this.server ?? (await this.starting?.then(() => this.server).catch(() => null));
    this.server = null;
    for (const socket of this.sockets) socket.destroy();
    if (server !== null && server !== undefined) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  private track(socket: Duplex): void {
    this.sockets.add(socket);
    socket.once('close', () => this.sockets.delete(socket));
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const header = Buffer.from(req.headers['proxy-authorization'] ?? '');
    return header.length === this.expectedAuth.length && timingSafeEqual(header, this.expectedAuth);
  }

  /** Policy check + single resolution. `null` means refused (listeners are told). */
  private async validate(host: string, port: number): Promise<ResolvedAddress[] | 'unreachable' | null> {
    try {
      return await resolveDestination(host, port, this.policy);
    } catch (error) {
      if (findAppError(error)?.statusCode === 403) {
        for (const listener of this.listeners) listener(`${host.toLowerCase()}:${port}`);
        return null;
      }
      return 'unreachable';
    }
  }

  /** Opens a TCP connection to one of the validated addresses, by IP: no name is resolved here. */
  private dial(addresses: readonly ResolvedAddress[], port: number): Promise<Socket> {
    const candidates = addresses.slice(0, MAX_DIAL_ATTEMPTS);
    const attempt = (index: number): Promise<Socket> =>
      new Promise<Socket>((resolve, reject) => {
        const address = candidates[index];
        if (address === undefined) {
          reject(new Error('no address left'));
          return;
        }
        const socket = connect({ host: dialHost(address), port, family: address.family });
        socket.setTimeout(CONNECT_TIMEOUT_MS, () => socket.destroy(new Error('connect timeout')));
        socket.once('connect', () => {
          socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
          this.track(socket);
          resolve(socket);
        });
        socket.once('error', (error) => {
          socket.destroy();
          attempt(index + 1).then(resolve, () => reject(error));
        });
      });
    return attempt(0);
  }

  /** `CONNECT host:port` — https and WebSocket tunnels. */
  private async onConnect(req: IncomingMessage, client: Duplex, head: Buffer): Promise<void> {
    const answer = (status: string, extra = ''): void => {
      client.end(`HTTP/1.1 ${status}\r\n${extra}Content-Length: 0\r\nConnection: close\r\n\r\n`);
    };
    client.on('error', () => client.destroy());

    if (!this.isAuthorized(req)) {
      answer('407 Proxy Authentication Required', 'Proxy-Authenticate: Basic realm="egress"\r\n');
      return;
    }
    const destination = splitHostPort(req.url ?? '', null);
    if (destination === null) {
      answer('400 Bad Request');
      return;
    }
    const [host, port] = destination;
    const addresses = await this.validate(host, port);
    if (addresses === null) {
      answer('403 Forbidden');
      return;
    }
    if (addresses === 'unreachable') {
      answer('502 Bad Gateway');
      return;
    }

    let upstream: Socket;
    try {
      upstream = await this.dial(addresses, port);
    } catch {
      answer('502 Bad Gateway');
      return;
    }
    if (client.destroyed) {
      upstream.destroy();
      return;
    }
    upstream.on('error', () => client.destroy());
    upstream.on('close', () => client.destroy());
    client.on('close', () => upstream.destroy());
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length > 0) upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  }

  /** `GET http://host/path` — plain http, one validation per request. */
  private async onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const refuse = (status: number, headers: Record<string, string> = {}): void => {
      // No body: a refused iframe must render as an empty frame, not as our text.
      res.writeHead(status, { 'content-length': '0', connection: 'close', ...headers }).end();
      req.resume();
    };

    if (!this.isAuthorized(req)) {
      refuse(407, { 'proxy-authenticate': 'Basic realm="egress"' });
      return;
    }
    let url: URL;
    try {
      // Only the absolute form is a proxy request; `GET /` would be someone browsing to us.
      if (!/^http:\/\//i.test(req.url ?? '')) throw new Error('not a proxy request');
      url = new URL(req.url ?? '');
    } catch {
      refuse(400);
      return;
    }
    const destination = splitHostPort(url.host, 80);
    if (destination === null || url.username !== '' || url.password !== '') {
      refuse(400);
      return;
    }
    const [host, port] = destination;
    const addresses = await this.validate(host, port);
    if (addresses === null || addresses === 'unreachable') {
      refuse(addresses === null ? 403 : 502);
      return;
    }

    let upstream: Socket;
    try {
      upstream = await this.dial(addresses, port);
    } catch {
      refuse(502);
      return;
    }

    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined && !HOP_BY_HOP.has(name)) headers[name] = value;
    }
    headers['host'] = url.host;
    headers['connection'] = 'close';

    const forward = httpRequest({
      // The socket is already connected to the validated address.
      createConnection: () => upstream,
      method: req.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      headers,
      setHost: false,
    });
    forward.on('response', (upstreamRes) => {
      const responseHeaders: Record<string, string | string[]> = {};
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        if (value !== undefined && !HOP_BY_HOP.has(name)) responseHeaders[name] = value;
      }
      res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
      upstreamRes.pipe(res);
      upstreamRes.on('error', () => res.destroy());
    });
    forward.on('error', () => {
      if (res.headersSent) res.destroy();
      else refuse(502);
    });
    res.on('close', () => forward.destroy());
    req.pipe(forward);
  }
}
