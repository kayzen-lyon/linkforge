import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import { ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { PdfService } from '../services/pdf-service.js';
import {
  CACHE_HEADERS,
  cacheControl,
  ForceParam,
  TargetHeaderParams,
  targetHeadersOf,
  TtlParam,
  UrlParam,
  WaitForSelectorParam,
} from './shared.js';

const PdfQuery = Type.Object(
  {
    url: UrlParam,
    format: Type.Optional(
      Type.Enum(['A4', 'Letter'], { type: 'string', default: 'A4', description: 'Paper size.' }),
    ),
    landscape: Type.Optional(Type.Boolean({ default: false })),
    printBackground: Type.Optional(
      Type.Boolean({ default: true, description: 'Print CSS background colours and images.' }),
    ),
    hideBanners: Type.Optional(
      Type.Boolean({
        default: false,
        description: 'Hide common cookie / consent banners before printing (nothing is clicked).',
      }),
    ),
    blockAds: Type.Optional(
      Type.Boolean({
        default: false,
        description:
          'Drop requests to a built-in list of well-known advertising and tracking hosts ' +
          '(faster, cleaner captures). Not a full ad blocker.',
      }),
    ),
    waitForSelector: WaitForSelectorParam,
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

export const pdfDoc: EndpointDoc = {
  path: '/api/v1/pdf',
  operationId: 'getPdf',
  summary: 'Page as PDF',
  description:
    'Prints the page with its print stylesheet. At most 100 pages; a document above the ' +
    'server size limit is refused with `ETOOLARGE`.',
  tag: 'Rendering',
  query: PdfQuery,
  responses: {
    '200': {
      description: 'The PDF document.',
      headers: CACHE_HEADERS,
      content: { 'application/pdf': Type.String({ format: 'binary' }) },
    },
  },
  errors: [...TARGET_ERRORS, ErrorCode.TooLarge, ErrorCode.SelectorNotFound],
};

export interface PdfRouteOptions {
  readonly pdfService: PdfService;
}

/** `GET /api/v1/pdf?url=...` — the page printed to PDF (`application/pdf`). */
export const pdfRoutes: FastifyPluginAsyncTypebox<PdfRouteOptions> = async (app, options) => {
  app.get('/pdf', { schema: { querystring: PdfQuery } }, async (request, reply) => {
    const {
      url,
      format = 'A4',
      landscape = false,
      printBackground = true,
      force = false,
      ttl,
    } = request.query;

    const result = await options.pdfService.print({
      url,
      format,
      landscape,
      printBackground,
      hideBanners: request.query.hideBanners ?? false,
      blockAds: request.query.blockAds ?? false,
      waitForSelector: request.query.waitForSelector ?? null,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });

    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', 'inline; filename="page.pdf"')
      .header('x-cache', result.cached ? 'HIT' : 'MISS')
      .header('x-render-source', 'browser')
      .header('cache-control', cacheControl(result.ttlSeconds))
      .send(result.pdf);
  });
};
