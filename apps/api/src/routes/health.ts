import type { FastifyPluginAsync } from 'fastify';

import type { BrowserPool } from '../services/browser-pool.js';
import type { Cache } from '../services/cache/index.js';

export interface HealthRouteOptions {
  readonly pool: BrowserPool;
  readonly cache: Cache;
}

/** `GET /health` — liveness probe plus a snapshot of the browser pool. */
export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    cache: options.cache.kind,
    browserPool: options.pool.stats(),
  }));
};
