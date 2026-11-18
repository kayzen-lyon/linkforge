import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import type { MetaService } from '../services/meta-service.js';

const MetaQuery = Type.Object(
  {
    url: Type.String({ minLength: 1, maxLength: 2048, description: 'Absolute http(s) URL.' }),
    render: Type.Optional(
      Type.Union([Type.Literal('auto'), Type.Literal('never'), Type.Literal('always')], {
        default: 'auto',
        description: 'Browser rendering strategy.',
      }),
    ),
    force: Type.Optional(Type.Boolean({ default: false, description: 'Bypass the cache.' })),
  },
  { additionalProperties: false },
);

export interface MetaRouteOptions {
  readonly metaService: MetaService;
  readonly cacheTtlSeconds: number;
}

/**
 * `GET /api/v1/meta?url=...` — rich link-preview metadata.
 *
 * Responds with `{ status, data, meta }`; `meta.source` tells whether the data
 * came from the raw HTTP pass or from a browser render.
 */
export const metaRoutes: FastifyPluginAsyncTypebox<MetaRouteOptions> = async (app, options) => {
  app.get('/meta', { schema: { querystring: MetaQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, render = 'auto', force = false } = request.query;

    const result = await options.metaService.getMetadata({ url, render, force });

    return reply
      .header('x-cache', result.cached ? 'HIT' : 'MISS')
      .header('cache-control', `public, max-age=${options.cacheTtlSeconds}`)
      .send({
        status: 'success',
        data: result.data,
        meta: {
          cached: result.cached,
          source: result.source,
          durationMs: Math.round(performance.now() - startedAt),
        },
      });
  });
};
