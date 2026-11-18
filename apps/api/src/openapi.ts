/**
 * OpenAPI 3.1 description of the public API.
 *
 * Query parameters are derived from the very schemas the routes validate
 * with, so the document cannot drift from the implementation. Response bodies
 * are described next to each route (`*Doc` exports) but are documentation
 * only: attaching them to Fastify would switch on response serialisation,
 * which silently drops any property a schema forgot.
 */
import { ErrorCode } from './lib/errors.js';

/** Version of the API contract, reported in `info.version`. */
export const API_VERSION = '0.4.0';

/** A JSON Schema object (TypeBox schemas are plain JSON Schema at runtime). */
type JsonSchema = object;

/** A TypeBox object schema, reduced to what parameter generation reads. */
export interface QuerySchema {
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
}

export interface ResponseDoc {
  readonly description: string;
  /** Media type → body schema. Omitted for body-less responses (redirects). */
  readonly content?: Readonly<Record<string, JsonSchema>>;
  /** Example of the `application/json` body, shown by documentation tools. */
  readonly example?: unknown;
  /** Response headers worth documenting, name → description. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** Everything needed to describe one endpoint. */
export interface EndpointDoc {
  /** Full path, e.g. `/api/v1/meta`. */
  readonly path: string;
  /** HTTP method; `get` when omitted. */
  readonly method?: 'get' | 'post';
  /** JSON request body (`post` only). */
  readonly body?: JsonSchema;
  readonly operationId: string;
  readonly summary: string;
  readonly description: string;
  readonly tag: string;
  readonly query?: QuerySchema;
  /** Non-error responses, keyed by HTTP status. */
  readonly responses: Readonly<Record<string, ResponseDoc>>;
  /** Error codes this endpoint can answer with. */
  readonly errors: readonly ErrorCode[];
}

/**
 * HTTP status and meaning of every error code. Typed as a complete record: a
 * new {@link ErrorCode} does not compile until it is documented here.
 */
export const ERROR_CATALOG: Readonly<Record<ErrorCode, { status: number; description: string }>> = {
  [ErrorCode.InvalidParams]: { status: 400, description: 'Invalid query parameters.' },
  [ErrorCode.InvalidUrl]: { status: 400, description: 'Malformed URL or unsupported scheme.' },
  [ErrorCode.Unauthorized]: { status: 401, description: 'Unknown `x-api-key`.' },
  [ErrorCode.ForbiddenUrl]: {
    status: 403,
    description: 'Destination refused by the anti-SSRF policy.',
  },
  [ErrorCode.EmbedNotFound]: {
    status: 404,
    description:
      'The item asked for is absent for this URL: `embed` path, preview image, oEmbed ' +
      'endpoint, icon or table.',
  },
  [ErrorCode.SelectorNotFound]: {
    status: 404,
    description:
      'No visible element matches `selector`, or `waitForSelector` did not appear in time.',
  },
  [ErrorCode.NotHtml]: { status: 422, description: 'The target is not an HTML document.' },
  [ErrorCode.TooLarge]: { status: 422, description: 'The generated output exceeds the size limit.' },
  [ErrorCode.RateLimited]: { status: 429, description: 'Too many requests.' },
  [ErrorCode.Browser]: { status: 500, description: 'The headless browser failed.' },
  [ErrorCode.Internal]: { status: 500, description: 'Unexpected server-side failure.' },
  [ErrorCode.Unreachable]: { status: 502, description: 'Target unreachable (DNS, TCP, TLS…).' },
  [ErrorCode.TargetStatus]: { status: 502, description: 'The target answered with an HTTP error.' },
  [ErrorCode.Blocked]: {
    status: 502,
    description:
      'The target served an anti-bot challenge or an access-denied page instead of its ' +
      'content. Nothing is cached.',
  },
  [ErrorCode.Busy]: { status: 503, description: 'Rendering pool saturated, retry shortly.' },
  [ErrorCode.CircuitOpen]: {
    status: 503,
    description:
      'The target host failed repeatedly (timeouts, refused connections) and is not ' +
      'contacted for a short while. Retry later.',
  },
  [ErrorCode.Timeout]: { status: 504, description: 'The target did not answer in time.' },
};

/** Errors any endpoint can answer with, whatever it does. */
export const COMMON_ERRORS: readonly ErrorCode[] = [
  ErrorCode.InvalidParams,
  ErrorCode.Unauthorized,
  ErrorCode.RateLimited,
  ErrorCode.Internal,
];

/** Errors shared by every endpoint that loads a target URL. */
export const TARGET_ERRORS: readonly ErrorCode[] = [
  ...COMMON_ERRORS,
  ErrorCode.InvalidUrl,
  ErrorCode.ForbiddenUrl,
  ErrorCode.Unreachable,
  ErrorCode.TargetStatus,
  ErrorCode.Blocked,
  ErrorCode.Timeout,
  ErrorCode.CircuitOpen,
  ErrorCode.Busy,
  ErrorCode.Browser,
];

const ERROR_SCHEMA = {
  type: 'object',
  required: ['status', 'code', 'message'],
  properties: {
    status: {
      type: 'string',
      enum: ['fail', 'error'],
      description: '`fail`: the request is at fault (4xx). `error`: the server or the target is (5xx).',
    },
    code: {
      type: 'string',
      enum: Object.values(ErrorCode),
      description: 'Stable machine-readable error code.',
    },
    message: { type: 'string', description: 'Human-readable explanation.' },
  },
} as const;

function parametersOf(query: QuerySchema): object[] {
  const required = new Set(query.required ?? []);
  return Object.entries(query.properties).map(([name, property]) => {
    const { description, ...schema } = property as Record<string, unknown>;
    return {
      name,
      in: 'query',
      required: required.has(name),
      ...(typeof description === 'string' && { description }),
      schema,
    };
  });
}

function errorResponses(codes: readonly ErrorCode[]): Record<string, object> {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const { status } = ERROR_CATALOG[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return Object.fromEntries(
    [...byStatus.entries()]
      .sort(([a], [b]) => a - b)
      .map(([status, statusCodes]) => [
        String(status),
        {
          description: statusCodes
            .map((code) => `\`${code}\` — ${ERROR_CATALOG[code].description}`)
            .join('\n\n'),
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      ]),
  );
}

function operationOf(endpoint: EndpointDoc): object {
  const success = Object.fromEntries(
    Object.entries(endpoint.responses).map(([status, response]) => [
      status,
      {
        description: response.description,
        headers: {
          'x-request-id': { $ref: '#/components/headers/x-request-id' },
          ...Object.fromEntries(
            Object.entries(response.headers ?? {}).map(([name, description]) => [
              name,
              { description, schema: { type: 'string' } },
            ]),
          ),
        },
        ...(response.content !== undefined && {
          content: Object.fromEntries(
            Object.entries(response.content).map(([type, schema]) => [
              type,
              type === 'application/json' && response.example !== undefined
                ? { schema, example: response.example }
                : { schema },
            ]),
          ),
        }),
      },
    ]),
  );

  return {
    operationId: endpoint.operationId,
    summary: endpoint.summary,
    description: endpoint.description,
    tags: [endpoint.tag],
    parameters: endpoint.query === undefined ? [] : parametersOf(endpoint.query),
    ...(endpoint.body !== undefined && {
      requestBody: { required: true, content: { 'application/json': { schema: endpoint.body } } },
    }),
    responses: { ...success, ...errorResponses(endpoint.errors) },
  };
}

/**
 * Builds the OpenAPI document for the given endpoints.
 *
 * @param endpoints - One description per route, in display order.
 */
export function buildOpenApiDocument(endpoints: readonly EndpointDoc[]): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Omnillink API',
      version: API_VERSION,
      description:
        'Link intelligence over HTTP: metadata, readable content, typed extraction, tables, ' +
        'screenshots, PDF, page insights, technology detection and small generators (QR code, ' +
        'social card). Every REST endpoint is a `GET`, except the metadata batch; `POST /mcp` ' +
        'exposes the read-only ones to AI agents over the Model Context Protocol. Errors share ' +
        'one JSON shape. Query parameters the API does not know are ignored.',
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: '/', description: 'This deployment' }],
    tags: [...new Set(endpoints.map((endpoint) => endpoint.tag))].map((name) => ({ name })),
    // The key is optional: anonymous calls work, with a lower rate limit.
    security: [{}, { ApiKey: [] }],
    paths: Object.fromEntries(
      endpoints.map((endpoint) => [
        endpoint.path,
        { [endpoint.method ?? 'get']: operationOf(endpoint) },
      ]),
    ),
    components: {
      securitySchemes: {
        ApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Optional. A valid key raises the rate limit and is its own bucket.',
        },
      },
      headers: {
        'x-request-id': {
          description:
            'Identifier of the request: the `x-request-id` sent by the client when it is ' +
            'well-formed, a generated one otherwise.',
          schema: { type: 'string' },
        },
      },
      schemas: { Error: ERROR_SCHEMA },
    },
  };
}
