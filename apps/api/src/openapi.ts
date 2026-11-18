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
  /**
   * `false` for a route the rate limiter skips, whose answers therefore carry
   * no `x-ratelimit-*` header. Rate limited when omitted.
   */
  readonly rateLimited?: boolean;
}

/** What the catalogue says of one error code. */
export interface ErrorDoc {
  readonly status: number;
  readonly description: string;
  /** The answer carries a `Retry-After` header: waiting is the remedy. */
  readonly retryAfter?: true;
}

/**
 * HTTP status and meaning of every error code. Typed as a complete record: a
 * new {@link ErrorCode} does not compile until it is documented here.
 */
export const ERROR_CATALOG: Readonly<Record<ErrorCode, ErrorDoc>> = {
  [ErrorCode.InvalidParams]: { status: 400, description: 'Invalid query parameters.' },
  [ErrorCode.InvalidUrl]: { status: 400, description: 'Malformed URL or unsupported scheme.' },
  [ErrorCode.Unauthorized]: { status: 401, description: 'Unknown `x-api-key`.' },
  [ErrorCode.ForbiddenUrl]: {
    status: 403,
    description: 'Destination refused by the anti-SSRF policy.',
  },
  [ErrorCode.RouteNotFound]: {
    status: 404,
    description: 'No route answers at this method and path.',
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
  [ErrorCode.RateLimited]: {
    status: 429,
    description: 'Too many requests. `Retry-After` tells when the window resets.',
    retryAfter: true,
  },
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
  [ErrorCode.Busy]: {
    status: 503,
    description: 'Rendering pool saturated, retry shortly (`Retry-After` gives a short wait).',
    retryAfter: true,
  },
  [ErrorCode.CircuitOpen]: {
    status: 503,
    description:
      'The target host failed repeatedly (timeouts, refused connections) and is not ' +
      'contacted for a short while. `Retry-After` tells when it will be tried again.',
    retryAfter: true,
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

const headerRef = (name: string): { $ref: string } => ({ $ref: `#/components/headers/${name}` });

/** Sent by the rate limiter on every answer of a route it covers, errors included. */
const RATE_LIMIT_HEADERS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'] as const;

/** Headers every answer of an endpoint carries, whatever its status. */
function standardHeaders(endpoint: EndpointDoc): Record<string, object> {
  return Object.fromEntries(
    ['x-request-id', ...(endpoint.rateLimited === false ? [] : RATE_LIMIT_HEADERS)].map((name) => [
      name,
      headerRef(name),
    ]),
  );
}

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

function errorResponses(endpoint: EndpointDoc): Record<string, object> {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of endpoint.errors) {
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
          headers: {
            ...standardHeaders(endpoint),
            // Only when every code of this status carries it: a header listed here is a promise.
            ...(statusCodes.every((code) => ERROR_CATALOG[code].retryAfter === true) && {
              'retry-after': headerRef('retry-after'),
            }),
          },
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
          ...standardHeaders(endpoint),
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
    responses: { ...success, ...errorResponses(endpoint) },
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
        'one JSON shape; a path or method no route serves answers `404 EROUTENOTFOUND`. Query ' +
        'parameters the API does not know are ignored. Rate-limited routes report the ' +
        "caller's quota on every answer (`x-ratelimit-*`), and `429` and `503` answers say " +
        'how long to wait in `Retry-After`.',
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
        'x-ratelimit-limit': {
          description:
            "Requests allowed per window for the caller's bucket (the API key when one is " +
            'sent, the client address otherwise).',
          schema: { type: 'integer', minimum: 1 },
        },
        'x-ratelimit-remaining': {
          description: 'Requests left in the current window.',
          schema: { type: 'integer', minimum: 0 },
        },
        'x-ratelimit-reset': {
          description: 'Seconds until the current window ends and the quota is whole again.',
          schema: { type: 'integer', minimum: 0 },
        },
        'retry-after': {
          description:
            'Seconds to wait before sending the request again: the rest of the rate-limit ' +
            'window on `429`, the time until the target host is tried again or a short ' +
            'back-off for a saturated rendering pool on `503`.',
          schema: { type: 'integer', minimum: 1 },
        },
      },
      schemas: { Error: ERROR_SCHEMA },
    },
  };
}
