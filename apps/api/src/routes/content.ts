import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import { ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { ContentService } from '../services/content-service.js';
import {
  CACHE_HEADERS,
  cacheControl,
  envelope,
  ForceParam,
  RenderParam,
  TtlParam,
  UrlParam,
} from './shared.js';

const ContentQuery = Type.Object(
  { url: UrlParam, render: RenderParam, force: ForceParam, ttl: TtlParam },
  { additionalProperties: false },
);

const ContentData = Type.Object({
  url: Type.String({ description: 'Final URL after redirects.' }),
  title: Type.Union([Type.String(), Type.Null()]),
  lang: Type.Union([Type.String(), Type.Null()]),
  excerpt: Type.Union([Type.String(), Type.Null()], {
    description: 'Declared description, else the beginning of the text.',
  }),
  text: Type.String({ description: 'Main content as plain text (at most 500 000 characters).' }),
  markdown: Type.String({ description: 'Main content as Markdown (at most 500 000 characters).' }),
  wordCount: Type.Integer(),
  readingTimeMinutes: Type.Integer({ description: 'At 200 words per minute, rounded up.' }),
});

export const contentDoc: EndpointDoc = {
  path: '/api/v1/content',
  operationId: 'getContent',
  summary: 'Readable content for AI and agents',
  description:
    'The main content of a page, without navigation or chrome, as plain text and Markdown.',
  tag: 'Extraction',
  query: ContentQuery,
  responses: {
    '200': {
      description: 'Readable content.',
      headers: CACHE_HEADERS,
      content: { 'application/json': envelope(ContentData) },
    },
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml],
};

export interface ContentRouteOptions {
  readonly contentService: ContentService;
}

/** `GET /api/v1/content?url=...` — main content as plain text and Markdown. */
export const contentRoutes: FastifyPluginAsyncTypebox<ContentRouteOptions> = async (
  app,
  options,
) => {
  app.get('/content', { schema: { querystring: ContentQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, render = 'auto', force = false, ttl } = request.query;

    const result = await options.contentService.getContent({
      url,
      render,
      force,
      ttlSeconds: ttl ?? null,
    });

    return reply
      .header('x-cache', result.cached ? 'HIT' : 'MISS')
      .header('cache-control', cacheControl(result.ttlSeconds))
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
