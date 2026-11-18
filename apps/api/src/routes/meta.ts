import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type, type TSchema } from 'typebox';

import { DOT_PATH_PATTERN, resolveDotPath, toHttpUrl } from '../lib/dot-path.js';
import { AppError, ErrorCode, findAppError } from '../lib/errors.js';
import { COMMON_ERRORS, TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { MetaService } from '../services/meta-service.js';
import {
  CACHE_HEADERS,
  cacheControl,
  envelope,
  ForceParam,
  JSON_HEADERS,
  NOT_MODIFIED,
  RenderParam,
  sendEnvelope,
  TargetHeaderParams,
  targetHeadersOf,
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
    ...TargetHeaderParams,
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
  dateModified: Nullable(Type.String({ description: 'ISO 8601 last-modification date.' })),
  type: Nullable(
    Type.String({ description: '`og:type` (`article`, `website`…), else the main JSON-LD `@type`.' }),
  ),
  themeColor: Nullable(Type.String({ description: '`<meta name="theme-color">`.' })),
  robots: Nullable(Type.String({ description: '`<meta name="robots">` directives, as declared.' })),
  oembed: Nullable(
    Type.String({ description: 'oEmbed endpoint advertised by the page (JSON preferred).' }),
  ),
  alternates: Type.Array(
    Type.Object({
      lang: Type.String({ description: 'BCP 47 tag, or `x-default`.' }),
      url: Type.String(),
    }),
    { description: 'Translations advertised with `hreflang` (at most 50).' },
  ),
  twitter: Type.Object({
    card: Nullable(Type.String({ description: '`twitter:card`.' })),
    site: Nullable(Type.String({ description: '`twitter:site` (@handle).' })),
  }),
  paywalled: Nullable(
    Type.Boolean({
      description:
        '`true` when JSON-LD declares `isAccessibleForFree: false`, `false` when it declares ' +
        'the content free, `null` when the page says nothing.',
    }),
  ),
  domain: Nullable(Type.String({ description: 'Host of `url`, without a leading `www.`.' })),
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
      headers: JSON_HEADERS,
      content: {
        'application/json': envelope(MetaData),
        'text/plain': Type.String(),
      },
    },
    '304': NOT_MODIFIED,
    '302': {
      description: 'With `embed`, when the selected value is an http(s) URL.',
      headers: { location: 'The selected URL.', ...CACHE_HEADERS },
    },
  },
  errors: [...TARGET_ERRORS, ErrorCode.EmbedNotFound],
};

/** Most URLs accepted by one batch call. */
export const BATCH_MAX_URLS = 10;

const BatchBody = Type.Object(
  {
    urls: Type.Array(UrlParam, {
      minItems: 1,
      maxItems: BATCH_MAX_URLS,
      description: `Absolute http(s) URLs, at most ${BATCH_MAX_URLS}. Duplicates are fetched once.`,
    }),
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const BatchItem = Type.Union([
  Type.Object({
    url: Type.String({ description: 'The URL as it was submitted.' }),
    status: Type.Literal('success'),
    data: MetaData,
    cached: Type.Boolean(),
  }),
  Type.Object({
    url: Type.String({ description: 'The URL as it was submitted.' }),
    status: Type.Enum(['fail', 'error'], { type: 'string' }),
    code: Type.Enum(Object.values(ErrorCode), {
      type: 'string',
      description: 'Same codes as `GET /api/v1/meta`.',
    }),
    message: Type.String(),
  }),
]);

export const metaBatchDoc: EndpointDoc = {
  path: '/api/v1/meta/batch',
  method: 'post',
  operationId: 'postMetaBatch',
  summary: 'Metadata of several URLs',
  description:
    `Metadata of up to ${BATCH_MAX_URLS} URLs in one call, over raw HTTP only (the equivalent ` +
    'of `render=never`: no browser). Results come back in input order; a URL that fails ' +
    'yields an error item and never fails the batch. Every URL goes through the same ' +
    'validation and anti-SSRF checks as `GET /api/v1/meta`. The answer is not cacheable by ' +
    'a CDN, but each item reads and feeds the server cache. Rate limit: one tenth of the ' +
    'caller\'s normal limit, counted separately.',
  tag: 'Metadata',
  body: BatchBody,
  responses: {
    '200': {
      description: 'One item per submitted URL, in the same order.',
      content: {
        'application/json': Type.Object({
          status: Type.Literal('success'),
          data: Type.Array(BatchItem),
          meta: Type.Object({
            succeeded: Type.Integer(),
            failed: Type.Integer(),
            durationMs: Type.Integer(),
          }),
        }),
      },
    },
  },
  errors: COMMON_ERRORS,
};

export interface MetaRouteOptions {
  readonly metaService: MetaService;
  /** Requests per window on the batch route, for an anonymous caller and for a key. */
  readonly batchRateLimit: { readonly max: number; readonly keyMax: number };
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
      headers: targetHeadersOf(request.query),
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
        .header('x-render-source', result.source)
        .header('cache-control', cacheControl(result.ttlSeconds))
        // The value comes from a third-party page: never let a browser guess its type.
        .header('x-content-type-options', 'nosniff');

      const location = typeof value === 'string' ? toHttpUrl(value) : null;
      if (location !== null) return reply.redirect(location, 302);
      if (typeof value === 'object') return reply.send(value);
      return reply.type('text/plain; charset=utf-8').send(String(value));
    }

    return sendEnvelope(request, reply, result, startedAt);
  });

  app.post(
    '/meta/batch',
    {
      schema: { body: BatchBody },
      config: {
        rateLimit: {
          max: (request: { apiKeyId: string | null }) =>
            request.apiKeyId === null ? options.batchRateLimit.max : options.batchRateLimit.keyMax,
        },
      },
    },
    async (request, reply) => {
      const startedAt = performance.now();
      const { urls, force = false, ttl } = request.body;

      // `getMetadata` already collapses identical concurrent lookups (single flight).
      const settled = await Promise.allSettled(
        urls.map((url) =>
          options.metaService.getMetadata({
            url,
            render: 'never',
            force,
            ttlSeconds: ttl ?? null,
          }),
        ),
      );

      const data = settled.map((outcome, index) => {
        const url = urls[index] ?? '';
        if (outcome.status === 'fulfilled') {
          return {
            url,
            status: 'success' as const,
            data: outcome.value.data,
            cached: outcome.value.cached,
          };
        }
        const error = findAppError(outcome.reason);
        if (error === undefined) {
          request.log.error({ err: outcome.reason as unknown, url }, 'batch item failed');
          return {
            url,
            status: 'error' as const,
            code: ErrorCode.Internal,
            message: 'Internal server error',
          };
        }
        return {
          url,
          status: error.statusCode >= 500 ? ('error' as const) : ('fail' as const),
          code: error.code,
          message: error.message,
        };
      });
      const succeeded = data.filter((item) => item.status === 'success').length;

      return reply.header('cache-control', 'no-store').send({
        status: 'success',
        data,
        meta: {
          succeeded,
          failed: data.length - succeeded,
          durationMs: Math.round(performance.now() - startedAt),
        },
      });
    },
  );
};
