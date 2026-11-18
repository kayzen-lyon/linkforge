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
    margin: Type.Optional(
      Type.Integer({
        minimum: 0,
        maximum: 50,
        description: 'Margin on every side, in millimetres. Default: the page\'s own `@page` margins.',
      }),
    ),
    scale: Type.Optional(
      Type.Number({ minimum: 0.1, maximum: 2, default: 1, description: 'Scale of the rendering.' }),
    ),
    pageRanges: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 80,
        pattern: '^[0-9,\\- ]+$',
        description: 'Pages to keep, e.g. `1-3,5` (pages 1 to 100, at most 10 ranges). Default: all.',
      }),
    ),
    headerText: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 200,
        description:
          'Plain text printed at the top of every page. It is escaped (no HTML); the tokens ' +
          '`{page}`, `{pages}`, `{title}`, `{url}` and `{date}` are filled in. Forces a top margin of at least 12 mm.',
      }),
    ),
    footerText: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 200,
        description: 'Plain text printed at the bottom of every page; same rules as `headerText`. Example: `Page {page} / {pages}`.',
      }),
    ),
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
    'Prints the page with its print stylesheet. Margins, scale, page ranges and a plain-text ' +
    'header and footer (escaped, with `{page}` / `{pages}` / `{title}` / `{url}` / `{date}` ' +
    'tokens) can be set. At most 100 pages; a document above the server size limit is ' +
    'refused with `ETOOLARGE`.',
  tag: 'Rendering',
  query: PdfQuery,
  responses: {
    '200': {
      description: 'The PDF document.',
      headers: CACHE_HEADERS,
      content: { 'application/pdf': Type.String({ format: 'binary' }) },
    },
  },
  errors: [...TARGET_ERRORS, ErrorCode.TooLarge, ErrorCode.SelectorNotFound, ErrorCode.NotHtml],
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
      marginMm: request.query.margin ?? null,
      scale: request.query.scale ?? 1,
      pageRanges: request.query.pageRanges ?? null,
      headerText: request.query.headerText ?? null,
      footerText: request.query.footerText ?? null,
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
