import type { FastifyPluginAsync } from 'fastify';

import { COMMON_ERRORS, type EndpointDoc } from '../openapi.js';

export const openApiDoc: EndpointDoc = {
  path: '/api/v1/openapi.json',
  operationId: 'getOpenApi',
  summary: 'This document',
  description: 'OpenAPI 3.1 description of the API.',
  tag: 'Service',
  responses: {
    '200': {
      description: 'OpenAPI document.',
      content: { 'application/json': { type: 'object' } },
    },
  },
  errors: COMMON_ERRORS,
};

export interface OpenApiRouteOptions {
  /** The document to serve, built once at boot. */
  readonly document: Readonly<Record<string, unknown>>;
}

/** `GET /api/v1/openapi.json` — machine-readable description of the API. */
export const openApiRoutes: FastifyPluginAsync<OpenApiRouteOptions> = async (app, options) => {
  app.get('/openapi.json', async (_request, reply) =>
    reply.header('cache-control', 'public, max-age=300').send(options.document),
  );
};
