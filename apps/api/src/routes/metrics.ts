import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';

import { AppError, ErrorCode } from '../lib/errors.js';
import type { Metrics } from '../lib/metrics.js';
import type { EndpointDoc } from '../openapi.js';

export const metricsDoc: EndpointDoc = {
  path: '/metrics',
  operationId: 'getMetrics',
  summary: 'Prometheus metrics',
  description:
    'Counters, a latency histogram and gauges in the Prometheus text format: requests by ' +
    'route pattern, method and status, cache hits, browser-pool and circuit-breaker state. ' +
    'Requires `Authorization: Bearer <METRICS_TOKEN>`; the route does not exist (404) when ' +
    'no token is configured. Values are per instance. No URL, IP address or API key appears in a label.',
  tag: 'Service',
  responses: {
    '200': { description: 'Exposition document.', content: { 'text/plain': { type: 'string' } } },
  },
  errors: [ErrorCode.Unauthorized, ErrorCode.RateLimited, ErrorCode.Internal],
};

export interface MetricsRouteOptions {
  readonly metrics: Metrics;
  readonly token: string;
}

/** Digest first: `timingSafeEqual` needs equal lengths, and the length must not leak either. */
const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** `GET /metrics` — Prometheus scrape endpoint, behind a bearer token. */
export const metricsRoutes: FastifyPluginAsync<MetricsRouteOptions> = async (app, options) => {
  const expected = digest(options.token);
  app.get('/metrics', async (request, reply) => {
    const presented = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1] ?? '';
    if (!timingSafeEqual(digest(presented), expected)) {
      void reply.header('www-authenticate', 'Bearer');
      throw AppError.unauthorized('A valid metrics token is required');
    }
    return reply
      .header('cache-control', 'no-store')
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(options.metrics.render());
  });
};
