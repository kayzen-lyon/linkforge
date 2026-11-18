/**
 * SSRF through the browser: redirects, sub-resources and DNS answers that
 * change between the check and the connection.
 *
 * Fixtures live on loopback, so the suite runs with private networks allowed
 * and marks ONE destination as forbidden with the policy's deny list
 * (`blockedHosts`): the "internal" server below. It counts TCP connections, so
 * "never contacted" is asserted at the socket level, not on HTTP semantics.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type AppConfig, type ResolvedAddress, type SsrfPolicy } from '../src/config.js';
import { buildApp } from '../src/create-app.js';
import { EgressProxy } from '../src/security/egress-proxy.js';

const SECRET = 'INTERNAL-SECRET-8c1f';

let internal: Server;
let internalPort: number;
let internalConnections = 0;
let site: Server;
let sitePort: number;
let origin: string;
let app: FastifyInstance;
let config: AppConfig;
/** Answers of the fake resolver for `rebind.test`, consumed one per lookup. */
let rebindAnswers: string[] = [];
let rebindLookups = 0;

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
  );

const resolve = async (hostname: string): Promise<ResolvedAddress[]> => {
  if (hostname === 'rebind.test') {
    rebindLookups += 1;
    const address = rebindAnswers.length > 1 ? rebindAnswers.shift()! : rebindAnswers[0]!;
    return [{ address, family: 4 }];
  }
  if (hostname === 'mixed.test') {
    return [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.7', family: 4 },
    ];
  }
  return [{ address: '127.0.0.1', family: 4 }];
};

beforeAll(async () => {
  internal = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<h1>${SECRET}</h1>`);
  });
  internal.on('connection', () => {
    internalConnections += 1;
  });
  internalPort = await listen(internal);

  site = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://site').pathname;
    const to = (location: string) => res.writeHead(302, { location }).end();
    const html = (body: string) =>
      res.writeHead(200, { 'content-type': 'text/html' }).end(
        `<!doctype html><html><head><title>Public</title></head><body>${body}</body></html>`,
      );
    if (path === '/to-internal') to(`http://127.0.0.1:${internalPort}/secret`);
    else if (path === '/to-internal-twice') to('/to-internal');
    else if (path === '/to-internal-https') to(`https://127.0.0.1:${internalPort}/secret`);
    else if (path === '/to-internal-by-name') to(`http://localhost:${internalPort}/secret`);
    else if (path === '/embeds') {
      html(
        `<h1>Embeds</h1><img id="i" src="/to-internal"><iframe id="f" src="/to-internal"></iframe>
         <img src="/to-internal-https"><p id="xhr">pending</p>
         <script>fetch('/to-internal').then(r => r.text(), e => 'failed: ' + e.name)
           .then(t => { document.getElementById('xhr').textContent = 'xhr:' + t; });</script>`,
      );
    } else if (path === '/plain') html('<h1>Plain page</h1><p>Nothing special.</p>');
    else res.writeHead(404).end();
  });
  sitePort = await listen(site);
  origin = `http://127.0.0.1:${sitePort}`;

  const base = loadConfig({
    NODE_ENV: 'test',
    SSRF_ALLOW_PRIVATE_NETWORKS: 'true',
    SSRF_ALLOWED_PORTS: '*',
    SSRF_BLOCKED_HOSTS: `127.0.0.1:${internalPort}, 127.0.0.9`,
    RATE_LIMIT_MAX: '1000',
  });
  config = { ...base, ssrf: { ...base.ssrf, resolve } };
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
  for (const server of [site, internal]) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});

beforeEach(() => {
  internalConnections = 0;
  rebindLookups = 0;
});

const get = (path: string) => app.inject({ method: 'GET', url: path });
const enc = encodeURIComponent;

describe('browser SSRF: redirects', () => {
  it('refuses a main navigation that redirects to a forbidden destination', async () => {
    const res = await get(`/api/v1/screenshot?url=${enc(`${origin}/to-internal`)}`);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EFORBIDDENURL');
    expect(internalConnections).toBe(0);
  });

  it('refuses it after several hops, by host name, and over https (CONNECT)', async () => {
    for (const path of ['/to-internal-twice', '/to-internal-by-name', '/to-internal-https']) {
      const res = await get(`/api/v1/pdf?url=${enc(`${origin}${path}`)}`);
      expect(res.json().code, path).toBe('EFORBIDDENURL');
      expect(res.statusCode).toBe(403);
    }
    expect(internalConnections).toBe(0);
  });

  it('never fetches an image, iframe or XHR that redirects to one', async () => {
    const shot = await get(`/api/v1/screenshot?url=${enc(`${origin}/embeds`)}&waitFor=300`);
    expect(shot.statusCode).toBe(200);
    expect(internalConnections).toBe(0);

    const fields = enc(
      JSON.stringify({ xhr: { selector: '#xhr' }, frame: { selector: '#f', attr: 'src' } }),
    );
    const res = await get(
      `/api/v1/extract?url=${enc(`${origin}/embeds`)}&render=always&fields=${fields}`,
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toContain(SECRET);
    expect(res.json().data.fields.xhr).toMatch(/^xhr:(failed|$)/);
    expect(internalConnections).toBe(0);
  });

  it('still renders ordinary pages through the proxy', async () => {
    const res = await get(`/api/v1/content?url=${enc(`${origin}/plain`)}&render=always`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.text).toContain('Plain page');
  });
});

describe('browser SSRF: DNS answers that change (rebinding)', () => {
  it('sends the browser to the address the proxy validated, resolved once', async () => {
    // The name only exists in our resolver: Chromium can only load it through the proxy.
    rebindAnswers = ['127.0.0.1'];
    const res = await get(
      `/api/v1/content?url=${enc(`http://rebind.test:${sitePort}/plain`)}&render=always`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().data.text).toContain('Plain page');
  });

  it('refuses when the answer turns forbidden between the check and the connection', async () => {
    // Lookup 1 (request interception) sees a harmless address, lookup 2 (the
    // proxy, at connection time) sees the forbidden one.
    rebindAnswers = ['127.0.0.1', '127.0.0.9'];
    const res = await get(
      `/api/v1/screenshot?url=${enc(`http://rebind.test:${sitePort}/plain`)}`,
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EFORBIDDENURL');
    expect(rebindLookups).toBe(2);
  });
});

/** Minimal raw client: one request on a fresh socket, returns the status line and body. */
function raw(port: number, payload: string): Promise<string> {
  return new Promise((done, fail) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(payload));
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      data += chunk;
    });
    socket.on('end', () => done(data));
    socket.on('close', () => done(data));
    socket.on('error', fail);
    setTimeout(() => socket.destroy(), 1500);
  });
}

describe('EgressProxy', () => {
  const started: EgressProxy[] = [];
  const start = async (policy: SsrfPolicy) => {
    const proxy = new EgressProxy(policy);
    started.push(proxy);
    const endpoint = await proxy.endpoint();
    const auth = Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64');
    return { proxy, port: Number(new URL(endpoint.server).port), auth, endpoint };
  };
  afterAll(() => Promise.all(started.map((proxy) => proxy.close())));

  const viaProxy = (port: number, auth: string, url: string) =>
    new Promise<{ status: number; body: string }>((done, fail) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: url,
          headers: { host: new URL(url).host, 'proxy-authorization': `Basic ${auth}` },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (body += chunk));
          res.on('end', () => done({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on('error', fail);
      req.end();
    });

  it('listens on loopback only, on an ephemeral port, with a random credential', async () => {
    const a = await start(config.ssrf);
    const b = await start(config.ssrf);
    expect(new URL(a.endpoint.server).hostname).toBe('127.0.0.1');
    expect(a.port).not.toBe(b.port);
    expect(a.endpoint.password).not.toBe(b.endpoint.password);
    expect(a.endpoint.password.length).toBeGreaterThanOrEqual(32);
  });

  it('is not an open relay: no or wrong credentials get 407 and nothing is dialled', async () => {
    const { port } = await start(config.ssrf);
    const target = `127.0.0.1:${sitePort}`;
    expect(await raw(port, `GET http://${target}/plain HTTP/1.1\r\nHost: ${target}\r\n\r\n`)).toMatch(
      /^HTTP\/1\.1 407 /,
    );
    const wrong = Buffer.from('omnillink:nope').toString('base64');
    expect(
      await raw(
        port,
        `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Authorization: Basic ${wrong}\r\n\r\n`,
      ),
    ).toMatch(/^HTTP\/1\.1 407 /);
    // Origin-form requests (someone browsing to the proxy itself) are refused too.
    expect(await raw(port, 'GET / HTTP/1.1\r\nHost: x\r\n\r\n')).toMatch(/^HTTP\/1\.1 (400|407) /);
  });

  it('relays an allowed request and refuses a forbidden one, for GET and CONNECT', async () => {
    const { port, auth, proxy } = await start(config.ssrf);
    const blocked: string[] = [];
    proxy.onBlocked((destination) => blocked.push(destination));

    const ok = await viaProxy(port, auth, `${origin}/plain`);
    expect(ok.status).toBe(200);
    expect(ok.body).toContain('Plain page');

    const refused = await viaProxy(port, auth, `http://127.0.0.1:${internalPort}/secret`);
    expect(refused.status).toBe(403);
    expect(refused.body).not.toContain(SECRET);

    const head = `Proxy-Authorization: Basic ${auth}\r\n\r\n`;
    expect(await raw(port, `CONNECT 127.0.0.1:${internalPort} HTTP/1.1\r\n${head}`)).toMatch(
      /^HTTP\/1\.1 403 /,
    );
    expect(await raw(port, `CONNECT localhost:${internalPort} HTTP/1.1\r\n${head}`)).toMatch(
      /^HTTP\/1\.1 403 /,
    );
    expect(await raw(port, `CONNECT 127.0.0.1:${sitePort} HTTP/1.1\r\n${head}`)).toMatch(
      /^HTTP\/1\.1 200 /,
    );
    expect(internalConnections).toBe(0);
    expect(blocked).toEqual([
      `127.0.0.1:${internalPort}`,
      `127.0.0.1:${internalPort}`,
      `localhost:${internalPort}`,
    ]);
  });

  it('resolves once per connection and dials the address it validated', async () => {
    const { port, auth } = await start(config.ssrf);
    rebindAnswers = ['127.0.0.1', '127.0.0.9'];
    const first = await viaProxy(port, auth, `http://rebind.test:${sitePort}/plain`);
    expect(first.status).toBe(200);
    expect(rebindLookups).toBe(1);
    // The record now points to a forbidden address: the next connection is refused.
    const second = await viaProxy(port, auth, `http://rebind.test:${sitePort}/plain`);
    expect(second.status).toBe(403);
    expect(rebindLookups).toBe(2);
  });

  it('applies the production policy: private addresses, internal names, ports', async () => {
    const production: SsrfPolicy = { allowPrivateNetworks: false, allowedPorts: [80, 443], resolve };
    const { port, auth } = await start(production);
    const head = `Proxy-Authorization: Basic ${auth}\r\n\r\n`;
    for (const destination of [
      `127.0.0.1:${sitePort}`,
      '127.0.0.1:80',
      '169.254.169.254:80',
      '[::1]:80',
      '[::ffff:127.0.0.1]:80',
      'localhost:80',
      '10.0.0.1:443',
      'metadata.internal:80',
      'mixed.test:443', // one private record among public ones
      'rebind.test:80', // resolves to loopback
      '93.184.216.34:8080', // public address, port not allowed
    ]) {
      const answer = await raw(port, `CONNECT ${destination} HTTP/1.1\r\n${head}`);
      expect(answer, destination).toMatch(/^HTTP\/1\.1 403 /);
    }
    const viaGet = await viaProxy(port, auth, 'http://169.254.169.254/latest/meta-data/');
    expect(viaGet.status).toBe(403);
  });
});
