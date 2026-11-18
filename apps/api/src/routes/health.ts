import type { FastifyPluginAsync } from 'fastify';

import { ErrorCode } from '../lib/errors.js';
import type { EndpointDoc } from '../openapi.js';
import type { BrowserPool } from '../services/browser-pool.js';
import type { Cache } from '../services/cache/index.js';

export const healthDoc: EndpointDoc = {
  path: '/health',
  operationId: 'getHealth',
  summary: 'Service health',
  description: 'Liveness probe, cache backend and browser-pool counters. Not rate limited.',
  tag: 'Service',
  responses: {
    '200': {
      description: 'The service is up.',
      content: {
        'application/json': {
          type: 'object',
          properties: {
            status: { type: 'string', const: 'ok' },
            uptimeSeconds: { type: 'integer' },
            cache: { type: 'string', enum: ['memory', 'redis'] },
            browserPool: {
              type: 'object',
              properties: {
                active: { type: 'integer' },
                queued: { type: 'integer' },
                maxConcurrency: { type: 'integer' },
                browserConnected: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
  // No parameters and no rate limit on this route.
  errors: [ErrorCode.Unauthorized, ErrorCode.Internal],
};

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
