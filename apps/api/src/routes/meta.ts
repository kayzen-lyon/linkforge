import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type, type TSchema } from 'typebox';

import { DOT_PATH_PATTERN, resolveDotPath, toHttpUrl } from '../lib/dot-path.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { MetaService } from '../services/meta-service.js';
import {
  CACHE_HEADERS,
  cacheControl,
  envelope,
  ForceParam,
  RenderParam,
  TtlParam,
  UrlParam,
} from './shared.js';

const MetaQuery = Type.Object(
  {
    url: UrlParam,
    render: RenderParam,
    embed: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 100,
        pattern: DOT_PATH_PATTERN,
        description:
          'Dot path into `data` (`image.url`, `logo.url`, `favicon`, `title`, `images.0.url`). ' +
          'The answer is then that single value instead of the JSON envelope: a 302 redirect ' +
          'when it is an http(s) URL (usable as an `<img src>`), `text/plain` for a string, ' +
          'number or boolean, raw JSON for an object or array, 404 when absent or null.',
      }),
    ),
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const Nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);

const Image = Type.Object({
  url: Type.String(),
  width: Nullable(Type.Integer()),
  height: Nullable(Type.Integer()),
  type: Nullable(Type.String()),
  alt: Nullable(Type.String()),
});

/** Shape of `data` (documentation only, see `openapi.ts`). */
const MetaData = Type.Object({
  url: Type.String({ description: 'Final URL after redirects.' }),
  canonicalUrl: Nullable(Type.String()),
  title: Nullable(Type.String()),
  description: Nullable(Type.String()),
  author: Nullable(Type.String()),
  publisher: Nullable(Type.String()),
  lang: Nullable(Type.String()),
  date: Nullable(Type.String({ description: 'ISO 8601 publication date.' })),
  image: Nullable(Image),
  images: Type.Array(Image),
  favicon: Nullable(Type.String()),
  logo: Nullable(
    Type.Object(
      { url: Type.String() },
      { description: 'Best brand icon: JSON-LD logo, else the largest declared icon.' },
    ),
  ),
  video: Nullable(
    Type.Object({
      url: Type.String(),
      type: Nullable(Type.String({ description: '`text/html` for an embeddable player.' })),
      width: Nullable(Type.Integer()),
      height: Nullable(Type.Integer()),
    }),
  ),
  audio: Nullable(Type.Object({ url: Type.String(), type: Nullable(Type.String()) })),
  keywords: Type.Array(Type.String()),
  feeds: Type.Array(
    Type.Object({
      url: Type.String(),
      title: Nullable(Type.String()),
      type: Type.String({ description: 'e.g. `application/rss+xml`.' }),
    }),
  ),
  jsonLd: Type.Array(Type.Unknown(), { description: 'JSON-LD blocks, `@graph` flattened.' }),
  contentType: Nullable(Type.String()),
});

export const metaDoc: EndpointDoc = {
  path: '/api/v1/meta',
  operationId: 'getMeta',
  summary: 'Link-preview metadata',
  description:
    'Title, description, images, icons, media, feeds and JSON-LD of a page. With `embed`, ' +
    'answers with a single value of `data` instead of the envelope.',
  tag: 'Metadata',
  query: MetaQuery,
  responses: {
    '200': {
      description:
        'Metadata envelope. With `embed`: the selected value as `text/plain` (scalar) or ' +
        'raw JSON (object or array).',
      headers: CACHE_HEADERS,
      content: {
        'application/json': envelope(MetaData),
        'text/plain': Type.String(),
      },
    },
    '302': {
      description: 'With `embed`, when the selected value is an http(s) URL.',
      headers: { location: 'The selected URL.', ...CACHE_HEADERS },
    },
  },
  errors: [...TARGET_ERRORS, ErrorCode.EmbedNotFound],
};

export interface MetaRouteOptions {
  readonly metaService: MetaService;
}

/**
 * `GET /api/v1/meta?url=...` — rich link-preview metadata.
 *
 * Responds with `{ status, data, meta }`; `meta.source` tells whether the data
 * came from the raw HTTP pass or from a browser render. With `embed`, responds
 * with one value of `data` (redirect, plain text or raw JSON).
 */
export const metaRoutes: FastifyPluginAsyncTypebox<MetaRouteOptions> = async (app, options) => {
  app.get('/meta', { schema: { querystring: MetaQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, render = 'auto', force = false, embed, ttl } = request.query;

    const result = await options.metaService.getMetadata({
      url,
      render,
      force,
      ttlSeconds: ttl ?? null,
    });

    if (embed !== undefined) {
      const value = resolveDotPath(result.data, embed);
      if (value === undefined || value === null) {
        throw AppError.embedNotFound(`"${embed}" is not available for this URL`);
      }
      reply
        .header('x-cache', result.cached ? 'HIT' : 'MISS')
        .header('cache-control', cacheControl(result.ttlSeconds))
        // The value comes from a third-party page: never let a browser guess its type.
        .header('x-content-type-options', 'nosniff');

      const location = typeof value === 'string' ? toHttpUrl(value) : null;
      if (location !== null) return reply.redirect(location, 302);
      if (typeof value === 'object') return reply.send(value);
      return reply.type('text/plain; charset=utf-8').send(String(value));
    }

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
