import type { FastifyPluginAsync } from 'fastify';

import { PLAYGROUND_ASSETS } from '../generated/playground-assets.js';

/** Fingerprinted build output and font files never change: cache them for a year. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Pages are revalidated on every visit, so a deployment is visible at once. */
const REVALIDATE = 'public, max-age=0, must-revalidate';
/** Icons, manifest, sitemap… keep their name across deployments: a moderate lifetime. */
const MODERATE = 'public, max-age=86400';

function cacheControlFor(path: string): string {
  if (path.startsWith('/assets/') || path.startsWith('/fonts/')) return IMMUTABLE;
  if (path.endsWith('.html')) return REVALIDATE;
  return MODERATE;
}

/**
 * URL paths that serve an embedded file.
 *
 * An HTML page answers at its clean URL as well as at its file name:
 * `/index.html` → `/`, `/docs.html` → `/docs`, `/en/index.html` → `/en` and
 * `/en/`, `/en/docs.html` → `/en/docs`. Other files answer at their own path.
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

  const registered = new Set<string>();
  for (const asset of PLAYGROUND_ASSETS) {
    const body = Buffer.from(asset.base64, 'base64');
    const cacheControl = cacheControlFor(asset.path);

    for (const path of publicPaths(asset.path)) {
      // A file never shadows another one (e.g. a `docs` file next to `docs.html`).
      if (registered.has(path)) continue;
      registered.add(path);
      app.get(path, { config: { rateLimit: false } }, (_request, reply) =>
        reply
          .header('content-type', asset.contentType)
          .header('cache-control', cacheControl)
          .send(body),
      );
    }
  }
  app.log.info({ files: PLAYGROUND_ASSETS.length, routes: registered.size }, 'website embedded');
};
