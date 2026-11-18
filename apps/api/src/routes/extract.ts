import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import { ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { ExtractService } from '../services/extract-service.js';
import { EXTRACT_LIMITS } from '../services/field-extractor.js';
import {
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
  WaitForSelectorParam,
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
    waitForSelector: WaitForSelectorParam,
    ...TargetHeaderParams,
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
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(ExtractData) },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml, ErrorCode.SelectorNotFound],
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
      waitForSelector: request.query.waitForSelector ?? null,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });
    return sendEnvelope(request, reply, result, startedAt);
  });
};
