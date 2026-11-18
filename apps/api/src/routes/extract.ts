import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import { ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { ExtractService } from '../services/extract-service.js';
import { EXTRACT_LIMITS } from '../services/field-extractor.js';
import { PRESETS, presetFieldNames } from '../services/structured-extractor.js';
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
    fields: Type.Optional(Type.String({
      minLength: 2,
      maxLength: 8000,
      description:
        'Required unless `preset` is given. JSON-encoded object mapping a field name to a rule ' +
        '`{ "selector": string, "attr"?: "text" | "html" | <attribute>, ' +
        '"type"?: "string" | "number" | "url", "all"?: boolean }`. ' +
        `At most ${EXTRACT_LIMITS.maxFields} fields; selectors up to ` +
        `${EXTRACT_LIMITS.maxSelectorLength} characters. Example: ` +
        '`{"price":{"selector":".price","type":"number"},' +
        '"links":{"selector":"a","attr":"href","type":"url","all":true}}`.',
    })),
    preset: Type.Optional(
      Type.Enum([...PRESETS], {
        type: 'string',
        description:
          'Built-in typed fields instead of `fields`, read from schema.org JSON-LD, then ' +
          'microdata, Open Graph, `<meta>` tags and a few CSS fallbacks. `sources` tells where ' +
          'each value came from. ' +
          PRESETS.map((preset) => `\`${preset}\`: ${presetFieldNames(preset).join(', ')}.`).join(' '),
      }),
    ),
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
  preset: Type.Optional(Type.Enum([...PRESETS], { type: 'string', description: 'With `preset` only: the preset applied.' })),
  schemaType: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'With `preset` only: schema.org type of the node the fields were read from (`NewsArticle`, `Product`…), `null` when the page declares none.',
    }),
  ),
  sources: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Union([Type.Enum(['json-ld', 'microdata', 'opengraph', 'meta', 'css'], { type: 'string' }), Type.Null()]),
      { description: 'With `preset` only: field name → where its value came from; `null` for a field that is `null`.' },
    ),
  ),
});

export const extractDoc: EndpointDoc = {
  path: '/api/v1/extract',
  operationId: 'getExtract',
  summary: 'Custom extraction rules',
  description:
    'Scrapes client-defined fields with CSS selectors (`fields`), or a built-in set of typed ' +
    'fields for an article, a product, a recipe or an event (`preset`). Exactly one of the ' +
    'two is required. With `render=auto`, the browser is used when the page runs scripts ' +
    'and the static markup leaves a field (a key field, for a preset) empty.',
  tag: 'Extraction',
  query: ExtractQuery,
  responses: {
    '200': {
      description: 'Extracted fields.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(ExtractData) },
      example: {
        status: 'success',
        data: {
          url: 'https://shop.example/kettle',
          preset: 'product',
          schemaType: 'Product',
          fields: {
            name: 'Pour-Over Kettle 0.9 L', description: 'Gooseneck kettle with a built-in thermometer.', brand: 'Kettlewell',
            sku: 'KW-090-BS', gtin: '4006381333931', image: 'https://shop.example/img/kettle.png', price: 64, currency: 'EUR',
            availability: 'InStock', condition: 'NewCondition', ratingValue: 4.7, reviewCount: 212, seller: 'Northfold',
            url: 'https://shop.example/kettle',
          },
          sources: {
            name: 'json-ld', description: 'json-ld', brand: 'json-ld', sku: 'json-ld', gtin: 'json-ld', image: 'json-ld', price: 'json-ld',
            currency: 'json-ld', availability: 'json-ld', condition: 'json-ld', ratingValue: 'json-ld', reviewCount: 'json-ld',
            seller: 'json-ld', url: 'json-ld',
          },
        },
        meta: { cached: false, source: 'http', durationMs: 87 },
      },
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
      fields: fields ?? null,
      preset: request.query.preset ?? null,
      render,
      waitForSelector: request.query.waitForSelector ?? null,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });
    return sendEnvelope(request, reply, result, startedAt);
  });
};
