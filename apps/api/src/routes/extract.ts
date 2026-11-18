import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import { ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { ExtractService } from '../services/extract-service.js';
import { EXTRACT_LIMITS } from '../services/field-extractor.js';
import {
  CACHE_HEADERS,
  cacheControl,
  envelope,
  ForceParam,
  RenderParam,
  TtlParam,
  UrlParam,
} from './shared.js';

const ExtractQuery = Type.Object(
  {
    url: UrlParam,
    fields: Type.String({
      minLength: 2,
      maxLength: 8000,
      description:
        'JSON-encoded object mapping a field name to a rule ' +
        '`{ "selector": string, "attr"?: "text" | "html" | <attribute>, ' +
        '"type"?: "string" | "number" | "url", "all"?: boolean }`. ' +
        `At most ${EXTRACT_LIMITS.maxFields} fields; selectors up to ` +
        `${EXTRACT_LIMITS.maxSelectorLength} characters. Example: ` +
        '`{"price":{"selector":".price","type":"number"},' +
        '"links":{"selector":"a","attr":"href","type":"url","all":true}}`.',
    }),
    render: RenderParam,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const Scalar = Type.Union([Type.String(), Type.Number()]);

const ExtractData = Type.Object({
  url: Type.String({ description: 'Final URL after redirects.' }),
  fields: Type.Record(
    Type.String(),
    Type.Union([Scalar, Type.Null(), Type.Array(Scalar)]),
    {
      description:
        'One entry per requested field. `null` when nothing matched or the value could not ' +
        `be converted; an array (at most ${EXTRACT_LIMITS.maxItems} items) with \`all\`. ` +
        `String values are cut at ${EXTRACT_LIMITS.maxValueLength} characters.`,
    },
  ),
});

export const extractDoc: EndpointDoc = {
  path: '/api/v1/extract',
  operationId: 'getExtract',
  summary: 'Custom extraction rules',
  description:
    'Scrapes client-defined fields with CSS selectors. With `render=auto`, the browser is ' +
    'used when the page runs scripts and the static markup leaves a field empty.',
  tag: 'Extraction',
  query: ExtractQuery,
  responses: {
    '200': {
      description: 'Extracted fields.',
      headers: CACHE_HEADERS,
      content: { 'application/json': envelope(ExtractData) },
    },
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml],
};

export interface ExtractRouteOptions {
  readonly extractService: ExtractService;
}

/** `GET /api/v1/extract?url=...&fields={...}` — client-defined scraping rules. */
export const extractRoutes: FastifyPluginAsyncTypebox<ExtractRouteOptions> = async (
  app,
  options,
) => {
  app.get('/extract', { schema: { querystring: ExtractQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, fields, render = 'auto', force = false, ttl } = request.query;

    const result = await options.extractService.extract({
      url,
      fields,
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
