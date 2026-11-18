import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import { ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { ContentService } from '../services/content-service.js';
import {
  envelope,
  ForceParam,
  JSON_HEADERS,
  NOT_MODIFIED,
  RenderParam,
  revalidate,
  sendEnvelope,
  TargetHeaderParams,
  targetHeadersOf,
  TtlParam,
  UrlParam,
  WaitForSelectorParam,
} from './shared.js';

const SelectorList = (description: string) =>
  Type.Optional(Type.String({ minLength: 1, maxLength: 2000, description }));

const ContentQuery = Type.Object(
  {
    url: UrlParam,
    render: RenderParam,
    format: Type.Optional(
      Type.Enum(['json', 'markdown', 'text'], {
        type: 'string',
        default: 'json',
        description:
          '`json`: the envelope. `markdown` / `text`: the body alone, as `text/markdown` or ' +
          '`text/plain`, ready to be piped into a prompt.',
      }),
    ),
    mainContent: Type.Optional(
      Type.Boolean({
        default: true,
        description:
          'Keep only the main content. `false` keeps the whole `<body>` (scripts and styles aside).',
      }),
    ),
    include: SelectorList(
      'Comma-separated CSS selectors: keep only the matching elements (document order). ' +
        'Replaces main-content detection. At most 20 selectors of 200 characters.',
    ),
    exclude: SelectorList(
      'Comma-separated CSS selectors of elements to remove before extraction. ' +
        'At most 20 selectors of 200 characters.',
    ),
    citations: Type.Optional(
      Type.Boolean({
        default: false,
        description:
          'Reference-style links in `markdown`: `[label][1]` in the text, the numbered URLs at the end.',
      }),
    ),
    waitForSelector: WaitForSelectorParam,
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const ContentData = Type.Object({
  url: Type.String({ description: 'Final URL after redirects.' }),
  title: Type.Union([Type.String(), Type.Null()]),
  lang: Type.Union([Type.String(), Type.Null()]),
  excerpt: Type.Union([Type.String(), Type.Null()], {
    description: 'Declared description, else the beginning of the text.',
  }),
  text: Type.String({ description: 'Main content as plain text (at most 500 000 characters).' }),
  markdown: Type.String({ description: 'Main content as Markdown (at most 500 000 characters).' }),
  wordCount: Type.Integer(),
  readingTimeMinutes: Type.Integer({ description: 'At 200 words per minute, rounded up.' }),
  truncated: Type.Boolean({ description: 'True when `text` or `markdown` was cut at the size cap.' }),
  links: Type.Array(
    Type.Object({
      url: Type.String({ description: 'Absolute http(s) URL.' }),
      text: Type.String({ description: 'Visible text of the link (at most 200 characters).' }),
      internal: Type.Boolean({ description: 'Same host as the page (`www.` ignored).' }),
    }),
    { description: 'Links of the extracted content, de-duplicated, at most 500.' },
  ),
  images: Type.Array(
    Type.Object({
      url: Type.String({ description: 'Absolute URL of the largest rendition offered.' }),
      alt: Type.String(),
    }),
    { description: 'Images of the extracted content, de-duplicated, at most 200.' },
  ),
});

export const contentDoc: EndpointDoc = {
  path: '/api/v1/content',
  operationId: 'getContent',
  summary: 'Readable content for AI and agents',
  description:
    'The main content of a page, without navigation or chrome, as plain text and Markdown.',
  tag: 'Extraction',
  query: ContentQuery,
  responses: {
    '200': {
      description:
        'Readable content. With `format=markdown` or `format=text`: the body alone.',
      headers: JSON_HEADERS,
      content: {
        'application/json': envelope(ContentData),
        'text/markdown': Type.String(),
        'text/plain': Type.String(),
      },
      example: {
        status: 'success',
        data: {
          url: 'https://example.com/blog/tide-tables',
          title: 'The tide tables were wrong by eleven minutes',
          lang: 'en-GB',
          excerpt: 'A new sensor shows high water arriving earlier than the printed tables predicted.',
          text: 'The tide tables were wrong by eleven minutes\n\nThe tide tables for the estuary were first printed in 1867…',
          markdown: '# The tide tables were wrong by eleven minutes\n\nThe tide tables for the estuary were first printed in 1867… See the [open data portal](https://data.example.org/tides).',
          wordCount: 1240,
          readingTimeMinutes: 7,
          truncated: false,
          links: [{ url: 'https://data.example.org/tides', text: 'open data portal', internal: false }],
          images: [{ url: 'https://example.com/img/gauge.jpg', alt: 'The tide gauge' }],
        },
        meta: { cached: false, source: 'http', durationMs: 95 },
      },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml, ErrorCode.SelectorNotFound],
};

export interface ContentRouteOptions {
  readonly contentService: ContentService;
}

/** `GET /api/v1/content?url=...` — main content as plain text and Markdown. */
export const contentRoutes: FastifyPluginAsyncTypebox<ContentRouteOptions> = async (
  app,
  options,
) => {
  app.get('/content', { schema: { querystring: ContentQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, render = 'auto', format = 'json', force = false, ttl } = request.query;

    const result = await options.contentService.getContent({
      url,
      render,
      mainContent: request.query.mainContent ?? true,
      include: request.query.include ?? null,
      exclude: request.query.exclude ?? null,
      citations: request.query.citations ?? false,
      waitForSelector: request.query.waitForSelector ?? null,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });

    if (format === 'json') return sendEnvelope(request, reply, result, startedAt);

    const body = format === 'markdown' ? result.data.markdown : result.data.text;
    if (revalidate(request, reply, result, body)) return reply;
    return reply
      .header('x-content-type-options', 'nosniff')
      .type(`${format === 'markdown' ? 'text/markdown' : 'text/plain'}; charset=utf-8`)
      .send(body);
  });
};
