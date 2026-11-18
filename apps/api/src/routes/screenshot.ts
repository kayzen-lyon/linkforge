import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import type { ScreenshotService } from '../services/screenshot-service.js';

const ScreenshotQuery = Type.Object(
  {
    url: Type.String({ minLength: 1, maxLength: 2048, description: 'Absolute http(s) URL.' }),
    device: Type.Optional(
      Type.Union([Type.Literal('desktop'), Type.Literal('mobile')], { default: 'desktop' }),
    ),
    fullPage: Type.Optional(Type.Boolean({ default: false })),
    format: Type.Optional(
      Type.Union([Type.Literal('png'), Type.Literal('jpeg')], { default: 'png' }),
    ),
    quality: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 80 })),
    force: Type.Optional(Type.Boolean({ default: false, description: 'Bypass the cache.' })),
  },
  { additionalProperties: false },
);

export interface ScreenshotRouteOptions {
  readonly screenshotService: ScreenshotService;
  readonly cacheTtlSeconds: number;
}

/**
 * `GET /api/v1/screenshot?url=...&device=desktop|mobile` — page capture.
 *
 * Responds with the raw image (`image/png` or `image/jpeg`), so the endpoint
 * can be used directly as an `<img src>`.
 */
export const screenshotRoutes: FastifyPluginAsyncTypebox<ScreenshotRouteOptions> = async (
  app,
  options,
) => {
  app.get('/screenshot', { schema: { querystring: ScreenshotQuery } }, async (request, reply) => {
    const {
      url,
      device = 'desktop',
      fullPage = false,
      format = 'png',
      quality = 80,
      force = false,
    } = request.query;

    const result = await options.screenshotService.capture({
      url,
      device,
      fullPage,
      format,
      quality,
      force,
    });

    return reply
      .header('content-type', result.contentType)
      .header('x-cache', result.cached ? 'HIT' : 'MISS')
      .header('cache-control', `public, max-age=${options.cacheTtlSeconds}, s-maxage=${options.cacheTtlSeconds}`)
      .send(result.image);
  });
};
