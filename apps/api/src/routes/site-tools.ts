import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type, type TSchema } from 'typebox';

import { ErrorCode } from '../lib/errors.js';
import { COMMON_ERRORS, TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import { SITEMAP_MAX_FILES, type SiteToolsService } from '../services/site-tools-service.js';
import { TECH_CATEGORIES } from '../services/tech-detector.js';
import { TECH_MAX_BUNDLES, type TechService } from '../services/tech-service.js';
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
  WaitForSelectorParam,
  TtlParam,
  UrlParam,
} from './shared.js';

const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);

/** Errors of the endpoints that never use the browser. */
const HTTP_ONLY_ERRORS: readonly ErrorCode[] = [
  ...COMMON_ERRORS,
  ErrorCode.InvalidUrl,
  ErrorCode.ForbiddenUrl,
  ErrorCode.Unreachable,
  ErrorCode.Timeout,
  ErrorCode.CircuitOpen,
];

// --- /links -------------------------------------------------------------------

const LinksQuery = Type.Object(
  {
    url: UrlParam,
    render: RenderParam,
    scope: Type.Optional(
      Type.Enum(['all', 'internal', 'external'], {
        type: 'string',
        default: 'all',
        description: 'Keep every link, or only those on / off the page\'s own host.',
      }),
    ),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 2000,
        default: 500,
        description: 'Most links returned. `truncated` tells when more matched.',
      }),
    ),
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const LinksData = Type.Object({
  url: Type.String({ description: 'Final URL after redirects.' }),
  total: Type.Integer({ description: 'Distinct links on the page, before `scope` and `limit`.' }),
  internal: Type.Integer(),
  external: Type.Integer(),
  links: Type.Array(
    Type.Object({
      url: Type.String({ description: 'Absolute http(s) URL, fragment removed.' }),
      text: Type.String({ description: 'Link text, else its title or image alt (200 characters).' }),
      rel: Type.Array(Type.String(), { description: 'Tokens of `rel`, lower-cased.' }),
      internal: Type.Boolean({ description: 'Same host as the page (`www.` ignored).' }),
      nofollow: Type.Boolean({ description: '`rel` contains `nofollow`, `sponsored` or `ugc`.' }),
    }),
  ),
  truncated: Type.Boolean(),
});

export const linksDoc: EndpointDoc = {
  path: '/api/v1/links',
  operationId: 'getLinks',
  summary: 'Links of a page',
  description:
    'Every `<a href>` of a page: absolute, de-duplicated, in document order, with its text, ' +
    '`rel` tokens and whether it stays on the site. With `render=auto` the browser is used ' +
    'when the page runs scripts and its static markup is nearly empty or contains no link.',
  tag: 'Extraction',
  query: LinksQuery,
  responses: {
    '200': {
      description: 'Links of the page.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(LinksData) },
      example: {
        status: 'success',
        data: {
          url: 'https://example.com/blog',
          total: 2,
          internal: 1,
          external: 1,
          links: [
            { url: 'https://example.com/about', text: 'About', rel: [], internal: true, nofollow: false },
            { url: 'https://partner.org/', text: 'Partner', rel: ['nofollow', 'noopener'], internal: false, nofollow: true },
          ],
          truncated: false,
        },
        meta: { cached: false, source: 'http', durationMs: 84 },
      },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml],
};

// --- /check -------------------------------------------------------------------

const CheckQuery = Type.Object({ url: UrlParam }, { additionalProperties: false });

const CheckData = Type.Object({
  url: Type.String({ description: 'The URL checked, normalised.' }),
  finalUrl: Type.String({ description: 'URL of the last hop.' }),
  ok: Type.Boolean({ description: 'True when the final status is below 400.' }),
  status: Type.Integer({ description: 'HTTP status of the last hop.' }),
  redirects: Type.Array(
    Type.Object({
      url: Type.String(),
      status: Type.Integer(),
      durationMs: Type.Integer({ description: 'Connection + TLS + time to response headers.' }),
      location: Nullable(Type.String({ description: 'Where this hop redirects; `null` on the last one.' })),
    }),
    { description: 'Every hop, the last one included, in order.' },
  ),
  contentType: Nullable(Type.String()),
  contentLength: Nullable(Type.Integer({ description: 'Declared `Content-Length`, when announced.' })),
  tls: Nullable(
    Type.Object(
      {
        subject: Nullable(Type.String({ description: 'Common name of the certificate.' })),
        issuer: Nullable(Type.String()),
        validFrom: Type.String({ description: 'ISO 8601.' }),
        validTo: Type.String({ description: 'ISO 8601.' }),
        daysLeft: Type.Integer({ description: 'Whole days until expiry.' }),
      },
      { description: 'Certificate of the last hop; `null` over plain http.' },
    ),
  ),
  durationMs: Type.Integer({ description: 'Whole check, every hop included.' }),
});

export const checkDoc: EndpointDoc = {
  path: '/api/v1/check',
  operationId: 'getCheck',
  summary: 'Link checker',
  description:
    'State of a link right now: final status, the redirect chain with status and timing of ' +
    'each hop, the TLS certificate when the last hop is https, declared type and length. ' +
    'Raw HTTP only, bodies are never downloaded, every hop goes through the anti-SSRF ' +
    'checks. An HTTP error of the target is a result (`ok: false`), not an API error. ' +
    'Never cached. An invalid or expired certificate is reported as `EUNREACHABLE`.',
  tag: 'Site tools',
  query: CheckQuery,
  responses: {
    '200': {
      description: 'Result of the check.',
      content: {
        'application/json': Type.Object({
          status: Type.Literal('success'),
          data: CheckData,
          meta: Type.Object({ durationMs: Type.Integer() }),
        }),
      },
      example: {
        status: 'success',
        data: {
          url: 'http://example.com/',
          finalUrl: 'https://example.com/',
          ok: true,
          status: 200,
          redirects: [
            { url: 'http://example.com/', status: 301, durationMs: 41, location: 'https://example.com/' },
            { url: 'https://example.com/', status: 200, durationMs: 118, location: null },
          ],
          contentType: 'text/html',
          contentLength: 1256,
          tls: {
            subject: 'example.com',
            issuer: "Let's Encrypt",
            validFrom: '2026-10-01T00:00:00.000Z',
            validTo: '2026-12-30T23:59:59.000Z',
            daysLeft: 42,
          },
          durationMs: 161,
        },
        meta: { durationMs: 163 },
      },
    },
  },
  errors: HTTP_ONLY_ERRORS,
};

// --- /sitemap -----------------------------------------------------------------

const SitemapQuery = Type.Object(
  {
    url: Type.String({
      minLength: 1,
      maxLength: 2048,
      description:
        'Any URL of the site (its robots.txt and sitemaps are discovered), or the URL of a ' +
        'sitemap file to read directly.',
    }),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 5000,
        default: 500,
        description: 'Most URLs returned in `urls`. `urlCount` still counts all of them.',
      }),
    ),
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const SitemapData = Type.Object({
  robotsUrl: Type.String(),
  robotsFound: Type.Boolean({ description: 'robots.txt exists (HTTP 200, not an HTML page).' }),
  sitemaps: Type.Array(
    Type.Object({
      url: Type.String(),
      kind: Type.Enum(['index', 'urlset', 'unknown'], { type: 'string' }),
      urlCount: Type.Integer({ description: '`<url>` entries of this file (0 for an index).' }),
      error: Nullable(
        Type.String({ description: 'Why the file could not be read (`HTTP 404`, an error code…).' }),
      ),
    }),
    { description: `Files read, in discovery order (at most ${SITEMAP_MAX_FILES}).` },
  ),
  urlCount: Type.Integer({ description: 'URLs counted across every file read.' }),
  urls: Type.Array(
    Type.Object({
      url: Type.String(),
      lastmod: Nullable(Type.String({ description: '`<lastmod>` as declared.' })),
    }),
  ),
  truncated: Type.Boolean({
    description: 'A cap (files, bytes, URLs or time) cut the result short.',
  }),
});

export const sitemapDoc: EndpointDoc = {
  path: '/api/v1/sitemap',
  operationId: 'getSitemap',
  summary: 'robots.txt and sitemaps of a site',
  description:
    'Reads `/robots.txt`, then the sitemaps it declares (`/sitemap.xml` when it declares ' +
    `none). Index files are followed one level. Bounded: ${SITEMAP_MAX_FILES} files, the server's ` +
    'body limit per file (gzip accepted, 10 MB once decompressed), `limit` URLs. A file that ' +
    'cannot be read is reported in `sitemaps[].error` and does not fail the request.',
  tag: 'Site tools',
  query: SitemapQuery,
  responses: {
    '200': {
      description: 'Sitemaps and URLs.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(SitemapData) },
      example: {
        status: 'success',
        data: {
          robotsUrl: 'https://example.com/robots.txt',
          robotsFound: true,
          sitemaps: [
            { url: 'https://example.com/sitemap.xml', kind: 'index', urlCount: 0, error: null },
            { url: 'https://example.com/sitemap-posts.xml', kind: 'urlset', urlCount: 2, error: null },
          ],
          urlCount: 2,
          urls: [
            { url: 'https://example.com/', lastmod: '2026-11-02' },
            { url: 'https://example.com/blog/hello', lastmod: null },
          ],
          truncated: false,
        },
        meta: { cached: false, source: 'http', durationMs: 240 },
      },
    },
    '304': NOT_MODIFIED,
  },
  errors: HTTP_ONLY_ERRORS,
};

// --- /tech --------------------------------------------------------------------

const TechQuery = Type.Object(
  {
    url: UrlParam,
    render: Type.Optional(
      Type.Enum(['auto', 'never', 'always'], {
        type: 'string',
        default: 'auto',
        description:
          '`never`: response headers, markup and first-party bundles only. `always`: also the ' +
          'rendered DOM and a fixed, built-in probe of well-known globals and runtime markers ' +
          '(never caller-supplied code). `auto`: the browser only when the static markup is an ' +
          'empty shell in which no framework or library was recognised.',
      }),
    ),
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

/** One detected technology (shared with `/insights`). */
export const TechItem = Type.Object({
  name: Type.String(),
  category: Type.Enum([...TECH_CATEGORIES], { type: 'string' }),
  evidence: Type.String({
    description:
      'What triggered the detection: `header …`, `meta generator: …`, `asset: …`, ' +
      '`cookie: …`, `markup: …`, `bundle <path>: …`, `probe: <key>` or `implied by <name>`.',
  }),
  confidence: Type.Enum(['high', 'medium', 'low'], {
    type: 'string',
    description:
      '`high`: a trait only this product has. `medium`: a strong habit of it. `low`: a hint.',
  }),
  version: Nullable(
    Type.String({ description: 'Version stated by that very evidence; `null` when it states none.' }),
  ),
});

const TechData = Type.Object({
  url: Type.String({ description: 'Final URL after redirects.' }),
  technologies: Type.Array(TechItem),
  inspected: Type.Object(
    {
      bundles: Type.Integer({
        description: `First-party scripts and stylesheets read for runtime markers (at most ${TECH_MAX_BUNDLES}).`,
      }),
      rendered: Type.Boolean({ description: 'Whether the rendered DOM and the built-in probe were used.' }),
    },
    { description: 'What the detection looked at: an absence is only as strong as this.' },
  ),
});

export const techDoc: EndpointDoc = {
  path: '/api/v1/tech',
  operationId: 'getTech',
  summary: 'Technologies of a page',
  description:
    'CMS, framework, libraries, UI kit, build tool, analytics, CDN, hosting, e-commerce ' +
    'platform… recognised from the response headers, the generator tag, asset URLs, cookie ' +
    'names, markers in the markup, runtime markers in the first-party bundles and, when ' +
    'rendered, a fixed built-in probe of the running page. Every detection comes with its ' +
    'evidence, a confidence level and a version when the evidence states one. A product ' +
    'that leaves no trace is not listed: the answer never guesses.',
  tag: 'Site tools',
  query: TechQuery,
  responses: {
    '200': {
      description: 'Detected technologies.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(TechData) },
      example: {
        status: 'success',
        data: {
          url: 'https://example.com/',
          technologies: [
            { name: 'React', category: 'library', evidence: 'bundle /assets/index-BqK3xT9a.js: version:"19.1.0",rendererPackageName:"react-dom"', confidence: 'high', version: '19.1.0' },
            { name: 'Tailwind CSS', category: 'ui', evidence: 'bundle /assets/index-DiwrgTda.css: tailwindcss v4.1.4', confidence: 'high', version: '4.1.4' },
            { name: 'Vite', category: 'build-tool', evidence: 'bundle /assets/index-BqK3xT9a.js: __vite__mapDeps', confidence: 'high', version: null },
            { name: 'Vercel', category: 'hosting', evidence: 'header x-vercel-id: cdg1::iad1::abcde-1700000000000-0123456789ab', confidence: 'high', version: null },
          ],
          inspected: { bundles: 2, rendered: false },
        },
        meta: { cached: false, source: 'http', durationMs: 131 },
      },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml],
};

// --- /image -------------------------------------------------------------------

const ImageQuery = Type.Object(
  {
    url: Type.String({
      minLength: 1,
      maxLength: 2048,
      description: 'URL of an image, or of a page: its main preview image is then measured.',
    }),
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const ImageData = Type.Object({
  url: Type.String({ description: 'URL of the image measured, after redirects.' }),
  pageUrl: Nullable(Type.String({ description: 'The page it was found on, when `url` was a page.' })),
  format: Nullable(
    Type.String({ description: '`png`, `jpeg`, `gif` or `webp`; `null` when not recognised (SVG, AVIF…).' }),
  ),
  contentType: Nullable(Type.String()),
  width: Nullable(Type.Integer({ description: 'Real width in pixels, read from the file header.' })),
  height: Nullable(Type.Integer()),
  bytes: Nullable(Type.Integer({ description: 'File size announced by the server.' })),
});

export const imageDoc: EndpointDoc = {
  path: '/api/v1/image',
  operationId: 'getImage',
  summary: 'Real dimensions and weight of an image',
  description:
    'Format, pixel dimensions and byte size of an image, read from the first 128 KB of the ' +
    'file only (range request): the image is never downloaded in full nor decoded. Given a ' +
    'page URL, measures the page\'s main preview image (`og:image`…).',
  tag: 'Site tools',
  query: ImageQuery,
  responses: {
    '200': {
      description: 'Facts about the image.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(ImageData) },
      example: {
        status: 'success',
        data: {
          url: 'https://example.com/cover.jpg',
          pageUrl: 'https://example.com/blog/post',
          format: 'jpeg',
          contentType: 'image/jpeg',
          width: 1200,
          height: 630,
          bytes: 184211,
        },
        meta: { cached: false, source: 'http', durationMs: 96 },
      },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...HTTP_ONLY_ERRORS, ErrorCode.TargetStatus, ErrorCode.EmbedNotFound],
};

// --- /html --------------------------------------------------------------------

const HtmlQuery = Type.Object(
  {
    url: UrlParam,
    render: Type.Optional(
      Type.Enum(['auto', 'never', 'always'], {
        type: 'string',
        default: 'always',
        description:
          '`always` (default): the DOM serialised after scripts have run. `never`: the ' +
          'markup as served. `auto`: served markup unless it is an empty shell.',
      }),
    ),
    waitForSelector: WaitForSelectorParam,
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

export const htmlDoc: EndpointDoc = {
  path: '/api/v1/html',
  operationId: 'getHtml',
  summary: 'Rendered HTML of a page',
  description:
    'The HTML document of a page once rendered by a browser, as text. The answer is ' +
    'third-party markup: it is served as `text/plain` with `nosniff`, so a browser never ' +
    'interprets it on this origin. Treat it as untrusted input. Capped at the server\'s ' +
    'body limit (5 MB by default).',
  tag: 'Extraction',
  query: HtmlQuery,
  responses: {
    '200': {
      description: 'The HTML source, as plain text. `x-final-url` carries the URL after redirects.',
      headers: { ...JSON_HEADERS, 'x-final-url': 'URL of the document after redirects.' },
      content: { 'text/plain': Type.String() },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml, ErrorCode.SelectorNotFound],
};

export interface SiteToolsRouteOptions {
  readonly siteTools: SiteToolsService;
  readonly techService: TechService;
}

/** `/links`, `/check`, `/sitemap` and `/tech`. */
export const siteToolsRoutes: FastifyPluginAsyncTypebox<SiteToolsRouteOptions> = async (
  app,
  options,
) => {
  const tools = options.siteTools;

  app.get('/links', { schema: { querystring: LinksQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, render = 'auto', scope = 'all', limit = 500, force = false, ttl } = request.query;
    const result = await tools.links({
      url,
      render,
      scope,
      limit,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });
    return sendEnvelope(request, reply, result, startedAt);
  });

  app.get('/check', { schema: { querystring: CheckQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const data = await tools.check(request.query.url);
    return reply.header('cache-control', 'no-store').send({
      status: 'success',
      data,
      meta: { durationMs: Math.round(performance.now() - startedAt) },
    });
  });

  app.get('/sitemap', { schema: { querystring: SitemapQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, limit = 500, force = false, ttl } = request.query;
    const result = await tools.sitemap({ url, limit, force, ttlSeconds: ttl ?? null });
    return sendEnvelope(request, reply, result, startedAt);
  });

  app.get('/image', { schema: { querystring: ImageQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, force = false, ttl } = request.query;
    const result = await tools.image({ url, force, ttlSeconds: ttl ?? null });
    return sendEnvelope(request, reply, result, startedAt);
  });

  app.get('/html', { schema: { querystring: HtmlQuery } }, async (request, reply) => {
    const { url, render = 'always', force = false, ttl } = request.query;
    const result = await tools.html({
      url,
      render,
      waitForSelector: request.query.waitForSelector ?? null,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });
    void reply.header('x-final-url', encodeURI(result.data.url));
    if (revalidate(request, reply, result, result.data.html)) return reply;
    return reply
      // Third-party markup: never something a browser would run from our origin.
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .type('text/plain; charset=utf-8')
      .send(result.data.html);
  });

  app.get('/tech', { schema: { querystring: TechQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, render = 'auto', force = false, ttl } = request.query;
    const result = await options.techService.detect({
      url,
      render,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });
    return sendEnvelope(request, reply, result, startedAt);
  });
};
