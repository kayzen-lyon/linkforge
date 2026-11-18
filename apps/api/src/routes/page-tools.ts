import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type, type TSchema } from 'typebox';

import { HEX_COLOR_PATTERN, parseHexColor } from '../lib/colors.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { encodeBilevelPng } from '../lib/png.js';
import { encodeQr, QrCapacityError, qrToSvg } from '../lib/qr.js';
import { COMMON_ERRORS, TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import {
  FAVICON_MAX_CANDIDATES,
  OEMBED_MAX_HTML,
  type PageToolsService,
} from '../services/page-tools-service.js';
import { TABLE_LIMITS, tableToCsv } from '../services/table-extractor.js';
import {
  cacheControl,
  envelope,
  etagOf,
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
} from './shared.js';

const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);

/** Errors of the endpoints that never use the browser. */
const HTTP_ONLY_ERRORS: readonly ErrorCode[] = [
  ...COMMON_ERRORS,
  ErrorCode.InvalidUrl,
  ErrorCode.ForbiddenUrl,
  ErrorCode.Unreachable,
  ErrorCode.TargetStatus,
  ErrorCode.Timeout,
  ErrorCode.CircuitOpen,
];

// --- /tables ------------------------------------------------------------------

const TablesQuery = Type.Object(
  {
    url: UrlParam,
    render: RenderParam,
    selector: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 300,
        description: 'CSS selector restricting which `<table>` elements are read (e.g. `#prices`, `table.specs`).',
      }),
    ),
    format: Type.Optional(
      Type.Enum(['json', 'csv'], {
        type: 'string',
        default: 'json',
        description: '`json`: every table in the envelope. `csv`: one table (see `table`) as `text/csv`.',
      }),
    ),
    table: Type.Optional(
      Type.Integer({
        minimum: 0,
        maximum: TABLE_LIMITS.maxTables - 1,
        default: 0,
        description: 'With `format=csv`: index of the table to export, as numbered in the JSON answer.',
      }),
    ),
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const TablesData = Type.Object({
  url: Type.String({ description: 'Final URL after redirects.' }),
  total: Type.Integer({ description: 'Data tables found on the page (layout tables are skipped).' }),
  tables: Type.Array(
    Type.Object({
      index: Type.Integer(),
      caption: Nullable(Type.String()),
      headers: Type.Array(Type.String(), {
        description: 'Column names, from `<thead>` or leading rows of `<th>` (several header rows are joined); empty when the table has none.',
      }),
      rows: Type.Array(Type.Array(Type.String()), {
        description: `Body rows as text, \`colspan\`/\`rowspan\` expanded: every row has \`columnCount\` values. At most ${TABLE_LIMITS.maxRows} rows, ${TABLE_LIMITS.maxColumns} columns, ${TABLE_LIMITS.maxCellLength} characters per cell.`,
      }),
      rowCount: Type.Integer(),
      columnCount: Type.Integer(),
      truncated: Type.Boolean({ description: 'Rows or columns of this table were dropped by a cap.' }),
    }),
    { description: `At most ${TABLE_LIMITS.maxTables} tables.` },
  ),
  truncated: Type.Boolean({ description: 'A cap (tables, rows or columns) cut the result.' }),
});

export const tablesDoc: EndpointDoc = {
  path: '/api/v1/tables',
  operationId: 'getTables',
  summary: 'HTML tables as JSON or CSV',
  description:
    'The data tables of a page as rows of text: headers detected, `colspan` and `rowspan` ' +
    'expanded, layout tables skipped. `format=csv` exports one table as RFC 4180 CSV; cells ' +
    'that a spreadsheet would run as a formula (`=`, `+`, `-`, `@`) are prefixed with an ' +
    'apostrophe. With `render=auto` the browser is used when the static markup holds no table.',
  tag: 'Extraction',
  query: TablesQuery,
  responses: {
    '200': {
      description: 'Tables of the page. With `format=csv`: the selected table as `text/csv`.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(TablesData), 'text/csv': Type.String() },
      example: {
        status: 'success',
        data: {
          url: 'https://example.com/pricing',
          total: 1,
          tables: [
            {
              index: 0,
              caption: 'Plans',
              headers: ['Plan', 'Price', 'Requests'],
              rows: [['Free', '€0', '1,000'], ['Pro', '€19', '50,000']],
              rowCount: 2,
              columnCount: 3,
              truncated: false,
            },
          ],
          truncated: false,
        },
        meta: { cached: false, source: 'http', durationMs: 74 },
      },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...TARGET_ERRORS, ErrorCode.NotHtml, ErrorCode.EmbedNotFound],
};

// --- /oembed ------------------------------------------------------------------

const OembedQuery = Type.Object(
  {
    url: UrlParam,
    maxWidth: Type.Optional(Type.Integer({ minimum: 1, maximum: 4096, description: 'Passed to the provider as `maxwidth`.' })),
    maxHeight: Type.Optional(Type.Integer({ minimum: 1, maximum: 4096, description: 'Passed to the provider as `maxheight`.' })),
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const OembedData = Type.Object({
  url: Type.String({ description: 'The page the embed describes, after redirects.' }),
  endpoint: Type.String({ description: 'The oEmbed endpoint that was read, as advertised by the page.' }),
  type: Nullable(Type.Enum(['photo', 'video', 'link', 'rich'], { type: 'string' })),
  version: Nullable(Type.String()),
  title: Nullable(Type.String()),
  authorName: Nullable(Type.String()),
  authorUrl: Nullable(Type.String()),
  providerName: Nullable(Type.String()),
  providerUrl: Nullable(Type.String()),
  thumbnailUrl: Nullable(Type.String()),
  thumbnailWidth: Nullable(Type.Integer()),
  thumbnailHeight: Nullable(Type.Integer()),
  width: Nullable(Type.Integer()),
  height: Nullable(Type.Integer()),
  photoUrl: Nullable(Type.String({ description: '`photo` only: URL of the image.' })),
  html: Nullable(
    Type.String({
      description:
        'UNTRUSTED third-party markup, exactly as the provider sent it (may contain scripts), ' +
        `cut at ${OEMBED_MAX_HTML} characters. Returned as an inert string: the API never ` +
        'interprets it. Do not inject it into a page without a sandbox (`<iframe sandbox>`) or a sanitiser.',
    }),
  ),
  cacheAge: Nullable(Type.Integer({ description: 'Lifetime suggested by the provider, in seconds.' })),
});

export const oembedDoc: EndpointDoc = {
  path: '/api/v1/oembed',
  operationId: 'getOembed',
  summary: 'oEmbed resolution',
  description:
    'Follows the oEmbed discovery link a page advertises (`<link type="application/json+oembed">`, ' +
    'XML accepted) and returns a normalised document: type, title, author, provider, thumbnail, ' +
    'dimensions, `html`. The endpoint is chosen by the page, so it goes through the same ' +
    'anti-SSRF checks as any target. `html` is untrusted third-party markup, returned as a ' +
    'string. A page that advertises no endpoint answers `404 EEMBEDNOTFOUND`: there is no ' +
    'built-in provider list.',
  tag: 'Metadata',
  query: OembedQuery,
  responses: {
    '200': {
      description: 'Normalised oEmbed document.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(OembedData) },
      example: {
        status: 'success',
        data: {
          url: 'https://video.example/watch/42',
          endpoint: 'https://video.example/oembed?format=json&url=https%3A%2F%2Fvideo.example%2Fwatch%2F42',
          type: 'video',
          version: '1.0',
          title: 'Tide tables explained',
          authorName: 'Estuary Gazette',
          authorUrl: 'https://video.example/@gazette',
          providerName: 'Example Video',
          providerUrl: 'https://video.example/',
          thumbnailUrl: 'https://video.example/thumb/42.jpg',
          thumbnailWidth: 480,
          thumbnailHeight: 270,
          width: 640,
          height: 360,
          photoUrl: null,
          html: '<iframe src="https://video.example/embed/42" width="640" height="360"></iframe>',
          cacheAge: 3600,
        },
        meta: { cached: false, source: 'http', durationMs: 143 },
      },
    },
    '304': NOT_MODIFIED,
  },
  errors: [...HTTP_ONLY_ERRORS, ErrorCode.NotHtml, ErrorCode.EmbedNotFound],
};

// --- /favicon -----------------------------------------------------------------

const FaviconQuery = Type.Object(
  {
    url: UrlParam,
    redirect: Type.Optional(
      Type.Boolean({
        default: false,
        description: '`true`: answer with a 302 to the best icon instead of JSON, so the URL works as an `<img src>`.',
      }),
    ),
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const Icon = Type.Object({
  url: Type.String(),
  rel: Type.Enum(['icon', 'apple-touch-icon', 'manifest', 'default'], {
    type: 'string',
    description: 'Where it was declared: a `<link>`, the web app manifest, or `default` for `/favicon.ico`.',
  }),
  declaredSizes: Nullable(Type.String({ description: '`sizes` as declared; the real size is in `width`/`height`.' })),
  format: Nullable(Type.String({ description: '`png`, `jpeg`, `gif`, `webp`, `ico` or `svg`.' })),
  contentType: Nullable(Type.String()),
  width: Nullable(Type.Integer({ description: 'Real width in pixels, read from the file header (largest image of an `.ico`); `null` for SVG.' })),
  height: Nullable(Type.Integer()),
  bytes: Nullable(Type.Integer({ description: 'File size announced by the server.' })),
});

export const faviconDoc: EndpointDoc = {
  path: '/api/v1/favicon',
  operationId: 'getFavicon',
  summary: 'Best icon of a site',
  description:
    'Collects the icons a page declares (`<link rel="icon">`, `apple-touch-icon`, web app ' +
    `manifest) plus \`/favicon.ico\`, measures up to ${FAVICON_MAX_CANDIDATES} of them from their first 128 KB ` +
    '(never decoding pixels) and returns the largest real raster icon, or a vector one when ' +
    'there is no raster. Declared sizes are not trusted: dimensions are read from the files. ' +
    'Icons are returned as they are: no resizing.',
  tag: 'Site tools',
  query: FaviconQuery,
  responses: {
    '200': {
      description: 'The best icon and every icon measured.',
      headers: JSON_HEADERS,
      content: { 'application/json': envelope(Type.Object({ pageUrl: Type.String(), icon: Icon, icons: Type.Array(Icon, { description: 'Largest first.' }) })) },
      example: {
        status: 'success',
        data: {
          pageUrl: 'https://example.com/',
          icon: { url: 'https://example.com/apple-touch-icon.png', rel: 'apple-touch-icon', declaredSizes: '180x180', format: 'png', contentType: 'image/png', width: 180, height: 180, bytes: 4211 },
          icons: [
            { url: 'https://example.com/apple-touch-icon.png', rel: 'apple-touch-icon', declaredSizes: '180x180', format: 'png', contentType: 'image/png', width: 180, height: 180, bytes: 4211 },
            { url: 'https://example.com/favicon.ico', rel: 'default', declaredSizes: null, format: 'ico', contentType: 'image/x-icon', width: 48, height: 48, bytes: 15086 },
          ],
        },
        meta: { cached: false, source: 'http', durationMs: 120 },
      },
    },
    '302': { description: 'With `redirect=true`: redirect to the best icon.', headers: { location: 'URL of the icon.' } },
    '304': NOT_MODIFIED,
  },
  errors: [...HTTP_ONLY_ERRORS, ErrorCode.EmbedNotFound],
};

// --- /qr ----------------------------------------------------------------------

const QrQuery = Type.Object(
  {
    url: Type.String({
      minLength: 1,
      maxLength: 2048,
      description: 'Absolute http(s) URL to encode. It is only encoded, never fetched.',
    }),
    format: Type.Optional(Type.Enum(['svg', 'png'], { type: 'string', default: 'svg' })),
    size: Type.Optional(
      Type.Integer({ minimum: 64, maximum: 2048, default: 512, description: 'Width and height of the image, in pixels.' }),
    ),
    margin: Type.Optional(
      Type.Integer({ minimum: 0, maximum: 16, default: 4, description: 'Quiet zone around the code, in modules (the standard asks for 4).' }),
    ),
    ecc: Type.Optional(
      Type.Enum(['L', 'M', 'Q', 'H'], {
        type: 'string',
        default: 'M',
        description: 'Error-correction level: `L` ~7 %, `M` ~15 %, `Q` ~25 %, `H` ~30 % of the code can be damaged.',
      }),
    ),
    color: Type.Optional(
      Type.String({ pattern: HEX_COLOR_PATTERN, default: '000000', description: 'Colour of the modules: hexadecimal `RGB`, `RRGGBB` or `RRGGBBAA`, with or without `#`.' }),
    ),
    background: Type.Optional(
      Type.String({ pattern: HEX_COLOR_PATTERN, default: 'ffffff', description: 'Background colour, same syntax; `00000000` for transparent. Keep a strong contrast with `color` or scanners will fail.' }),
    ),
  },
  { additionalProperties: false },
);

const Binary = Type.String({ format: 'binary' });

export const qrDoc: EndpointDoc = {
  path: '/api/v1/qr',
  operationId: 'getQr',
  summary: 'QR code of a URL',
  description:
    'The QR code of a URL as SVG (default) or PNG, usable directly as an `<img src>`. ' +
    'Computed locally: the URL is never requested. The smallest symbol that fits is chosen; a ' +
    'URL too long for the requested error-correction level answers `400`.',
  tag: 'Generators',
  query: QrQuery,
  responses: {
    '200': {
      description: 'The image.',
      headers: {
        'cache-control': '`public, max-age=86400, immutable`: the image only depends on the parameters.',
        etag: 'Validator of the image.',
        'x-qr-version': 'Symbol version chosen (1–40).',
      },
      content: { 'image/svg+xml': Type.String(), 'image/png': Binary },
    },
    '304': { description: 'The `ETag` sent in `If-None-Match` is still current; no body.' },
  },
  errors: [...COMMON_ERRORS, ErrorCode.InvalidUrl],
};

export interface PageToolsRouteOptions {
  readonly pageTools: PageToolsService;
}

/** `/tables`, `/oembed`, `/favicon` and `/qr`. */
export const pageToolsRoutes: FastifyPluginAsyncTypebox<PageToolsRouteOptions> = async (app, options) => {
  const tools = options.pageTools;

  app.get('/tables', { schema: { querystring: TablesQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, render = 'auto', format = 'json', table = 0, force = false, ttl } = request.query;
    const result = await tools.tables({
      url,
      render,
      selector: request.query.selector ?? null,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });
    if (format === 'json') return sendEnvelope(request, reply, result, startedAt);

    const selected = result.data.tables[table];
    if (selected === undefined) throw AppError.embedNotFound(`The page has no table at index ${table}`);
    const csv = tableToCsv(selected);
    if (revalidate(request, reply, result, csv)) return reply;
    return reply
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `attachment; filename="table-${table}.csv"`)
      .type('text/csv; charset=utf-8')
      .send(csv);
  });

  app.get('/oembed', { schema: { querystring: OembedQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, force = false, ttl } = request.query;
    const result = await tools.oembed({
      url,
      maxWidth: request.query.maxWidth ?? null,
      maxHeight: request.query.maxHeight ?? null,
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: ttl ?? null,
    });
    // `html` is third-party markup inside JSON: make sure nothing sniffs the answer as HTML.
    void reply.header('x-content-type-options', 'nosniff');
    return sendEnvelope(request, reply, result, startedAt);
  });

  app.get('/favicon', { schema: { querystring: FaviconQuery } }, async (request, reply) => {
    const startedAt = performance.now();
    const { url, redirect = false, force = false, ttl } = request.query;
    const result = await tools.favicon({ url, headers: targetHeadersOf(request.query), force, ttlSeconds: ttl ?? null });
    if (!redirect) return sendEnvelope(request, reply, result, startedAt);
    return reply
      .header('x-cache', result.cached ? 'HIT' : 'MISS')
      .header('cache-control', cacheControl(result.ttlSeconds))
      .redirect(result.data.icon.url, 302);
  });

  app.get('/qr', { schema: { querystring: QrQuery } }, async (request, reply) => {
    const { url, format = 'svg', size = 512, margin = 4, ecc = 'M' } = request.query;
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw AppError.invalidUrl('The URL is not valid');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw AppError.invalidUrl('Only http and https URLs are supported');
    }
    const color = parseHexColor(request.query.color ?? '000000', 'color');
    const background = parseHexColor(request.query.background ?? 'ffffff', 'background');

    let qr;
    try {
      qr = encodeQr(target.href, ecc);
    } catch (error) {
      if (error instanceof QrCapacityError) throw AppError.invalidParams(`url: too long for a QR code at level ${ecc}`);
      throw error;
    }
    const span = qr.size + margin * 2;
    if (format === 'png' && size < span) {
      throw AppError.invalidParams(`size: this code needs at least ${span} pixels (one per module)`);
    }

    let body: Buffer;
    if (format === 'svg') {
      body = Buffer.from(qrToSvg(qr, { size, margin, color: color.css, background: background.a === 0 ? null : background.css }), 'utf8');
    } else {
      // Whole pixels per module keep the edges sharp; what is left of `size` extends the quiet zone.
      const scale = Math.floor(size / span);
      const offset = Math.floor((size - qr.size * scale) / 2);
      body = encodeBilevelPng(
        size,
        size,
        (x, y) => {
          const mx = Math.floor((x - offset) / scale);
          const my = Math.floor((y - offset) / scale);
          return x >= offset && y >= offset && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx] === 1;
        },
        color,
        background,
      );
    }
    const etag = etagOf(body);
    void reply
      .header('etag', etag)
      .header('cache-control', 'public, max-age=86400, immutable')
      .header('x-qr-version', String(qr.version))
      .header('x-content-type-options', 'nosniff');
    if (request.headers['if-none-match'] === etag) return reply.status(304).send();
    return reply
      // An SVG opened directly is a document: forbid it everything but drawing itself.
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .type(format === 'svg' ? 'image/svg+xml; charset=utf-8' : 'image/png')
      .send(body);
  });
};
