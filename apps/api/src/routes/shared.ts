/**
 * Query parameters and response fragments shared by several routes.
 */
import { Type, type TSchema } from 'typebox';

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

/** `Cache-Control` for a cacheable answer: browsers and the CDN may both keep it. */
export function cacheControl(ttlSeconds: number): string {
  return `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`;
}

/** Headers documented on every cacheable response. */
export const CACHE_HEADERS = {
  'x-cache': '`HIT` when served from the server cache, `MISS` otherwise.',
  'cache-control': '`public, max-age=<ttl>, s-maxage=<ttl>`.',
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
