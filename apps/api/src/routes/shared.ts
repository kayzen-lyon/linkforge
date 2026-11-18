/**
 * Query parameters and response fragments shared by several routes.
 */
import { createHash } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';
import { Type, type TSchema } from 'typebox';

import { MAX_SELECTOR_LENGTH } from '../lib/selectors.js';
import { parseTargetHeaders, TARGET_HEADER_LIMITS, type TargetHeaders } from '../lib/target-headers.js';

/** Bounds of the `ttl` parameter, in seconds. */
export const TTL_MIN_SECONDS = 60;
export const TTL_MAX_SECONDS = 86_400;

export const UrlParam = Type.String({
  minLength: 1,
  maxLength: 2048,
  description: 'Absolute http(s) URL of the target page.',
});

export const RenderParam = Type.Optional(
  Type.Enum(['auto', 'never', 'always'], {
    type: 'string',
    default: 'auto',
    description:
      'Browser rendering strategy. `auto`: raw HTTP, then a headless browser only when ' +
      'needed. `never`: raw HTTP only. `always`: always render.',
  }),
);

export const ForceParam = Type.Optional(
  Type.Boolean({ default: false, description: 'Bypass the cache read (the result is still stored).' }),
);

export const TtlParam = Type.Optional(
  Type.Integer({
    minimum: TTL_MIN_SECONDS,
    maximum: TTL_MAX_SECONDS,
    description:
      'Cache lifetime of this answer, in seconds. Applies to the server cache entry and ' +
      'to `Cache-Control`. Defaults to the server configuration.',
  }),
);

export const WaitForSelectorParam = Type.Optional(
  Type.String({
    minLength: 1,
    maxLength: MAX_SELECTOR_LENGTH,
    description:
      'CSS selector that must be present in the DOM before the page is read or captured ' +
      '(at most 10 s, bounded by the request deadline). CSS only. Not found in time: ' +
      '`404 ESELECTORNOTFOUND`.',
  }),
);

/**
 * The only request headers a caller may set on the request to the target.
 * No `Cookie`, no `Authorization`: answers are cached by URL (server cache and
 * CDN), so credentials would leak from one caller to the next.
 */
export const TargetHeaderParams = {
  acceptLanguage: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: TARGET_HEADER_LIMITS.acceptLanguage,
      description:
        '`Accept-Language` sent to the target, e.g. `fr-FR,fr;q=0.9`. Applied on the raw HTTP ' +
        'path and in the browser; part of the cache key.',
    }),
  ),
  userAgent: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: TARGET_HEADER_LIMITS.userAgent,
      description:
        '`User-Agent` sent to the target (printable ASCII). Part of the cache key. Cookies ' +
        'and `Authorization` cannot be set: answers are cached by URL and shared between callers.',
    }),
  ),
  referer: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: TARGET_HEADER_LIMITS.referer,
      description: '`Referer` sent with the document request: an absolute http(s) URL. Part of the cache key.',
    }),
  ),
} as const;

/**
 * Reads the three header parameters of a query.
 *
 * @throws {AppError} `EINVALIDPARAMS`.
 */
export function targetHeadersOf(query: {
  readonly acceptLanguage?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly referer?: string | undefined;
}): TargetHeaders | null {
  return parseTargetHeaders(query);
}

/** Strong validator of a body: quoted base64url SHA-1. */
export function etagOf(body: string | Buffer): string {
  return `"${createHash('sha1').update(body).digest('base64url')}"`;
}

/** Tells whether `If-None-Match` lists `etag` (weak comparison, `*` included). */
function matchesEtag(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  return header
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//, ''))
    .some((candidate) => candidate === '*' || candidate === etag);
}

export interface CacheableAnswer {
  readonly cached: boolean;
  readonly ttlSeconds: number;
  /** Pipeline that produced the answer. */
  readonly source: 'http' | 'browser';
}

/**
 * Sets the headers shared by cacheable answers and handles revalidation.
 *
 * @param validator - What the `ETag` is computed from: the part of the answer
 *   that does not change between two identical results (never timings).
 * @returns `true` when the client's copy is current: a `304` has been sent and
 *   the caller must not send a body.
 */
export function revalidate(
  request: FastifyRequest,
  reply: FastifyReply,
  answer: CacheableAnswer,
  validator: string | Buffer,
): boolean {
  const etag = etagOf(validator);
  void reply
    .header('etag', etag)
    .header('x-cache', answer.cached ? 'HIT' : 'MISS')
    .header('x-render-source', answer.source)
    .header('cache-control', cacheControl(answer.ttlSeconds));
  if (!matchesEtag(request.headers['if-none-match'], etag)) return false;
  void reply.status(304).send();
  return true;
}

/** Sends the `{ status, data, meta }` envelope, or `304` when the client's copy is current. */
export function sendEnvelope(
  request: FastifyRequest,
  reply: FastifyReply,
  answer: CacheableAnswer & { readonly data: unknown },
  startedAt: number,
): FastifyReply {
  if (revalidate(request, reply, answer, JSON.stringify(answer.data))) return reply;
  return reply.send({
    status: 'success',
    data: answer.data,
    meta: {
      cached: answer.cached,
      source: answer.source,
      durationMs: Math.round(performance.now() - startedAt),
    },
  });
}

/** `Cache-Control` for a cacheable answer: browsers and the CDN may both keep it. */
export function cacheControl(ttlSeconds: number): string {
  return `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`;
}

/** Headers documented on every cacheable response. */
export const CACHE_HEADERS = {
  'x-cache': '`HIT` when served from the server cache, `MISS` otherwise.',
  'cache-control': '`public, max-age=<ttl>, s-maxage=<ttl>`.',
  'x-render-source': '`http` or `browser`: the pipeline that produced the answer.',
} as const;

/** Headers of JSON answers, which can be revalidated. */
export const JSON_HEADERS = {
  ...CACHE_HEADERS,
  etag: 'Validator of `data`. Send it back in `If-None-Match` to get `304 Not Modified`.',
} as const;

/** The `304` answer of endpoints that honour `If-None-Match`. */
export const NOT_MODIFIED = {
  description: 'The `ETag` sent in `If-None-Match` is still current; no body.',
  headers: JSON_HEADERS,
} as const;

/** The `{ status, data, meta }` envelope of JSON answers (documentation only). */
export function envelope<T extends TSchema>(data: T) {
  return Type.Object({
    status: Type.Literal('success'),
    data,
    meta: Type.Object({
      cached: Type.Boolean({ description: 'True when served from the server cache.' }),
      source: Type.Enum(['http', 'browser'], {
        type: 'string',
        description: 'Pipeline that produced the data.',
      }),
      durationMs: Type.Integer({ description: 'Server-side processing time.' }),
    }),
  });
}
