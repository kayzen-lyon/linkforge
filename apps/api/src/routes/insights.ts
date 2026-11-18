import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type, type TSchema } from 'typebox';

import { ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { InsightsService } from '../services/insights-service.js';
import { RESOURCE_KINDS } from '../services/network-meter.js';
import {
  envelope,
  ForceParam,
  JSON_HEADERS,
  NOT_MODIFIED,
  sendEnvelope,
  TargetHeaderParams,
  targetHeadersOf,
  TtlParam,
  UrlParam,
} from './shared.js';
import { TechItem } from './site-tools.js';

const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);

/** Appended to every number: none of them is a field score. */
const LAB = 'Lab measurement from a single load in a data-centre headless browser, not a field score.';

const InsightsQuery = Type.Object(
  {
    url: UrlParam,
    device: Type.Optional(
      Type.Enum(['desktop', 'mobile'], {
        type: 'string',
        default: 'desktop',
        description:
          '`desktop`: 1280×800. `mobile`: Pixel 7 profile (UA, DPR, touch). No network or CPU throttling is applied in either case.',
      }),
    ),
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const Weight = Type.Object({
  requests: Type.Integer({ description: `Requests that got a response. ${LAB}` }),
  transferBytes: Type.Integer({ description: `Encoded bytes received, response headers included. ${LAB}` }),
});

const InsightsData = Type.Object({
  url: Type.String({ description: 'Final URL after redirects.' }),
  device: Type.Enum(['desktop', 'mobile'], { type: 'string' }),
  measurement: Type.Literal('lab', {
    description:
      'Always `lab`: one load, cold cache, no throttling, in a data-centre headless browser. ' +
      'Not a field score (CrUX) and not a Lighthouse audit; values vary from one run to the next.',
  }),
  measuredAt: Type.String({ description: 'ISO 8601 time of the measurement (a cached answer keeps its original time).' }),
  status: Type.Integer({ description: 'HTTP status of the document.' }),
  loaded: Type.Boolean({ description: 'False when the `load` event did not fire within the navigation budget: figures are then partial.' }),
  timings: Type.Object({
    ttfbMs: Nullable(Type.Integer({ description: `Time to first byte of the document (Navigation Timing \`responseStart\`). ${LAB}` })),
    domContentLoadedMs: Nullable(Type.Integer({ description: `End of \`DOMContentLoaded\`. ${LAB}` })),
    loadMs: Nullable(Type.Integer({ description: `End of the \`load\` event; \`null\` when it did not fire. ${LAB}` })),
  }),
  vitals: Type.Object({
    fcpMs: Nullable(Type.Integer({ description: `First Contentful Paint. ${LAB}` })),
    lcpMs: Nullable(Type.Integer({ description: `Largest Contentful Paint observed up to the measurement. ${LAB}` })),
    lcpElement: Nullable(Type.String({ description: 'Tag name of the LCP element (`img`, `h1`…).' })),
    cls: Nullable(Type.Number({ description: `Cumulative Layout Shift during the load, without any interaction (largest session window). ${LAB}` })),
  }),
  network: Type.Object({
    requests: Weight.properties.requests,
    transferBytes: Weight.properties.transferBytes,
    byType: Type.Object(Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, Weight])), {
      description: `Requests and bytes by resource type. ${LAB}`,
    }),
    thirdParty: Type.Object({
      hostCount: Type.Integer({ description: `Distinct hosts outside the page's own site. ${LAB}` }),
      hosts: Type.Array(Type.String(), { description: 'Those hosts, sorted (at most 100).' }),
      requests: Type.Integer(),
      transferBytes: Type.Integer(),
    }),
    limitReached: Nullable(
      Type.Enum(['requests', 'bytes'], {
        type: 'string',
        description: 'Per-page cap that stopped the load, if any: the figures are then a lower bound.',
      }),
    ),
  }),
  dom: Type.Object({ elements: Nullable(Type.Integer({ description: 'Elements in the rendered DOM.' })) }),
  technologies: Type.Array(TechItem, {
    description: 'Technologies seen during this load (headers, rendered DOM, built-in probe), as `/tech` reports them.',
  }),
});

export const insightsDoc: EndpointDoc = {
  path: '/api/v1/insights',
  operationId: 'getInsights',
  summary: 'Page weight, timings and web vitals (lab)',
  description:
    'Loads the page once in a headless browser and reports what that load cost: total ' +
    'transfer size, requests and bytes by resource type, third-party hosts, TTFB, ' +
    'DOMContentLoaded, load, FCP, LCP and CLS, plus the technologies seen. Every number is ' +
    'a lab measurement from a single load in a data-centre browser — no throttling, cold ' +
    'cache — not a field score and not a Lighthouse audit. Use `force=true` to measure again.',
  tag: 'Site tools',
  query: InsightsQuery,
  responses: {
    '200': {
      description: 'Measurements of one load.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(InsightsData) },
      example: {
        status: 'success',
        data: {
          url: 'https://example.com/',
          device: 'desktop',
          measurement: 'lab',
          measuredAt: '2026-11-18T10:00:00.000Z',
          status: 200,
          loaded: true,
          timings: { ttfbMs: 84, domContentLoadedMs: 412, loadMs: 960 },
          vitals: { fcpMs: 380, lcpMs: 720, lcpElement: 'img', cls: 0.012 },
          network: {
            requests: 31,
            transferBytes: 684120,
            byType: {
              document: { requests: 1, transferBytes: 18200 },
              script: { requests: 9, transferBytes: 301000 },
              stylesheet: { requests: 2, transferBytes: 24100 },
              image: { requests: 12, transferBytes: 290400 },
              font: { requests: 2, transferBytes: 41200 },
              media: { requests: 0, transferBytes: 0 },
              xhr: { requests: 4, transferBytes: 8100 },
              other: { requests: 1, transferBytes: 1120 },
            },
            thirdParty: { hostCount: 2, hosts: ['fonts.gstatic.com', 'www.googletagmanager.com'], requests: 5, transferBytes: 132000 },
            limitReached: null,
          },
          dom: { elements: 842 },
          technologies: [
            { name: 'Next.js', category: 'framework', evidence: 'probe: next', confidence: 'high', version: '15.1.0' },
          ],
        },
        meta: { cached: false, source: 'browser', durationMs: 2140 },
      },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml],
};

export interface InsightsRouteOptions {
  readonly insightsService: InsightsService;
}

/** `GET /api/v1/insights?url=...` — what one load of the page costs. */
export const insightsRoutes: FastifyPluginAsyncTypebox<InsightsRouteOptions> = async (app, options) => {
  app.get('/insights', { schema: { querystring: InsightsQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, device = 'desktop', force = false, ttl } = request.query;
    const result = await options.insightsService.measure({
      url,
      device,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });
    return sendEnvelope(request, reply, result, startedAt);
  });
};
