import type { FastifyPluginAsync } from 'fastify';

import { PLAYGROUND_ASSETS } from '../generated/playground-assets.js';

/**
 * Serves the playground from memory when it has been embedded in the API
 * bundle (single-function deployments). Without embedded files — local
 * development, tests — the plugin registers nothing and the API stands alone.
 *
 * The route list is fixed at boot from the embedded manifest, so no request
 * path ever reaches the file system.
 */
export const playgroundRoutes: FastifyPluginAsync = async (app) => {
  if (PLAYGROUND_ASSETS.length === 0) return;

  for (const asset of PLAYGROUND_ASSETS) {
    const body = Buffer.from(asset.base64, 'base64');
    // Fingerprinted build assets never change and can be cached forever.
    const cacheControl = asset.path.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate';
    const paths = asset.path === '/index.html' ? ['/', '/index.html'] : [asset.path];

    for (const path of paths) {
      app.get(path, { config: { rateLimit: false } }, (_request, reply) =>
        reply
          .header('content-type', asset.contentType)
          .header('cache-control', cacheControl)
          .send(body),
      );
    }
  }
  app.log.info({ files: PLAYGROUND_ASSETS.length }, 'playground embedded');
};
