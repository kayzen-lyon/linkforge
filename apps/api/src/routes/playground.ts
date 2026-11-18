import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { PLAYGROUND_ASSETS } from '../generated/playground-assets.js';

/** Fingerprinted build output and font files never change: cache them for a year. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Pages (and the service worker) are revalidated on every visit, so a deployment is visible at once. */
const REVALIDATE = 'public, max-age=0, must-revalidate';
/** Icons, manifest, sitemap… keep their name across deployments: a moderate lifetime. */
const MODERATE = 'public, max-age=86400';

function cacheControlFor(path: string): string {
  if (path.startsWith('/assets/') || path.startsWith('/fonts/')) return IMMUTABLE;
  if (path.endsWith('.html') || path === '/sw.js' || path === '/boot.js') return REVALIDATE;
  return MODERATE;
}

/** Text formats worth compressing; images and fonts already are. */
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml|manifest\+json)|image\/svg\+xml)/;
/** Below this size the saving does not pay for the header. */
const COMPRESS_MIN_BYTES = 1024;

type Encoding = 'br' | 'gzip';

/** The best encoding the client accepts (`q=0` refuses one), Brotli first. */
export function negotiateEncoding(acceptEncoding: string | undefined): Encoding | null {
  if (acceptEncoding === undefined) return null;
  const accepted = new Set<string>();
  for (const part of acceptEncoding.toLowerCase().split(',')) {
    const [name = '', ...params] = part.trim().split(';');
    const q = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)?.[1]).find((value) => value !== undefined);
    if (q === undefined || Number(q) > 0) accepted.add(name.trim());
  }
  if (accepted.has('br')) return 'br';
  return accepted.has('gzip') ? 'gzip' : null;
}

function compress(body: Buffer, encoding: Encoding): Buffer {
  return encoding === 'br'
    ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: body.length } })
    : gzipSync(body, { level: 6 });
}

/**
 * Security headers of the website's HTML pages.
 *
 * The policy has no 'unsafe-inline': the site ships no inline script (its
 * pre-paint code is the file `/boot.js`; JSON-LD blocks are data, not script)
 * and no inline style. Images may come from any http(s) origin because a link
 * preview shows the image of the page the visitor asked about; nothing else
 * may leave the origin. API responses are not affected: these headers are
 * set on the pages only.
 */
export const SITE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'cross-origin-opener-policy': 'same-origin',
};

/**
 * URL paths that serve an embedded file.
 *
 * An HTML page answers at its clean URL as well as at its file name:
 * `/index.html` → `/`, `/docs.html` → `/docs`, `/en/index.html` → `/en` and
 * `/en/`, `/en/docs/errors.html` → `/en/docs/errors`. Other files answer at
 * their own path.
 */
export function publicPaths(assetPath: string): string[] {
  if (!assetPath.endsWith('.html')) return [assetPath];
  if (assetPath === '/index.html') return ['/', assetPath];
  if (assetPath.endsWith('/index.html')) {
    const directory = assetPath.slice(0, -'/index.html'.length);
    return [directory, `${directory}/`, assetPath];
  }
  return [assetPath.slice(0, -'.html'.length), assetPath];
}

/** Path of the not-found page for a request path: `/en/…` gets the English one when it exists. */
export function notFoundPageFor(path: string, available: ReadonlySet<string>): string | null {
  const prefix = /^\/([a-z]{2})(?:\/|$)/.exec(path)?.[1];
  const localized = prefix === undefined ? null : `/${prefix}/404.html`;
  if (localized !== null && available.has(localized)) return localized;
  return available.has('/404.html') ? '/404.html' : null;
}

/**
 * Serves the website from memory when it has been embedded in the API bundle
 * (single-function deployments). Without embedded files — local development,
 * tests — the plugin registers nothing and the API stands alone.
 *
 * The route list is fixed at boot from the embedded manifest, so no request
 * path ever reaches the file system.
 */
export const playgroundRoutes: FastifyPluginAsync = async (app) => {
  if (PLAYGROUND_ASSETS.length === 0) return;

  interface EmbeddedFile {
    readonly body: Buffer;
    readonly contentType: string;
    readonly cacheControl: string;
    readonly compressible: boolean;
    /** Compressed copies, made on first use and kept: each file is compressed at most once per encoding. */
    readonly encoded: Map<Encoding, Buffer>;
  }
  const files = new Map<string, EmbeddedFile>();
  for (const asset of PLAYGROUND_ASSETS) {
    const body = Buffer.from(asset.base64, 'base64');
    files.set(asset.path, {
      body,
      contentType: asset.contentType,
      cacheControl: cacheControlFor(asset.path),
      compressible: COMPRESSIBLE.test(asset.contentType) && body.length >= COMPRESS_MIN_BYTES,
      encoded: new Map(),
    });
  }

  const send = (request: FastifyRequest, reply: FastifyReply, assetPath: string, status = 200): FastifyReply => {
    const file = files.get(assetPath);
    if (file === undefined) {
      reply.callNotFound();
      return reply;
    }
    void reply.status(status).header('content-type', file.contentType).header('x-content-type-options', 'nosniff');
    void reply.header('cache-control', status === 200 ? file.cacheControl : 'no-store');
    if (assetPath.endsWith('.html')) void reply.headers(SITE_SECURITY_HEADERS);
    if (!file.compressible) return reply.send(file.body);
    const vary = reply.getHeader('vary');
    void reply.header('vary', typeof vary === 'string' && vary !== '' ? `${vary}, accept-encoding` : 'accept-encoding');
    const encoding = negotiateEncoding(request.headers['accept-encoding']);
    if (encoding === null) return reply.send(file.body);
    let body = file.encoded.get(encoding);
    if (body === undefined) {
      body = compress(file.body, encoding);
      file.encoded.set(encoding, body);
    }
    return reply.header('content-encoding', encoding).send(body);
  };

  const registered = new Set<string>();
  for (const assetPath of files.keys()) {
    for (const path of publicPaths(assetPath)) {
      // A file never shadows another one (e.g. a `docs` file next to `docs.html`).
      if (registered.has(path)) continue;
      registered.add(path);
      app.get(path, { config: { rateLimit: false } }, (request, reply) => send(request, reply, assetPath));
    }
  }

  // Any other page address gets the site's own not-found page, in the language
  // of its prefix. API paths keep the API's JSON answer.
  const available = new Set(files.keys());
  app.get('/*', { config: { rateLimit: false } }, (request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    const page = path.startsWith('/api/') ? null : notFoundPageFor(path, available);
    return page === null ? reply.callNotFound() : send(request, reply, page, 404);
  });

  app.log.info({ files: files.size, routes: registered.size }, 'website embedded');
};
