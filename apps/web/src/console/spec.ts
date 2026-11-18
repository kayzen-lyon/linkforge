/**
 * Reads the live OpenAPI document into the small model the console needs.
 *
 * The playground builds its forms from this, so an endpoint or a parameter
 * added to the API appears there without touching the site. Everything read
 * from the document is treated as data: it reaches the page as text only.
 */

export interface ParamDef {
  readonly name: string;
  readonly where: 'query' | 'body';
  readonly required: boolean;
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array';
  readonly options?: readonly string[];
  readonly fallback?: string;
  readonly min?: number;
  readonly max?: number;
  readonly maxItems?: number;
  /** English text from the document. */
  readonly description: string;
}

export interface Operation {
  readonly id: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly summary: string;
  readonly tag: string;
  readonly params: readonly ParamDef[];
  /** Media types of the success response. */
  readonly produces: readonly string[];
}

export interface ApiSpec {
  readonly title: string;
  readonly version: string;
  readonly operations: readonly Operation[];
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

function toParam(name: string, where: ParamDef['where'], required: boolean, schema: Json, description: string): ParamDef {
  const raw = str(schema['type']);
  const type: ParamDef['type'] =
    raw === 'integer' || raw === 'number' || raw === 'boolean' || raw === 'array' ? raw : 'string';
  const options = Array.isArray(schema['enum']) ? schema['enum'].filter((item): item is string => typeof item === 'string') : undefined;
  const fallback = schema['default'];
  const min = num(schema['minimum']);
  const max = num(schema['maximum']);
  const maxItems = num(schema['maxItems']);
  return {
    name,
    where,
    required,
    type,
    description: description === '' ? str(schema['description']) : description,
    ...(options === undefined || options.length === 0 ? {} : { options }),
    ...(fallback === undefined || fallback === null ? {} : { fallback: String(fallback) }),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(maxItems === undefined ? {} : { maxItems }),
  };
}

export function parseSpec(document: unknown): ApiSpec {
  if (!isObject(document) || !isObject(document['paths'])) throw new Error('Not an OpenAPI document');
  const info = isObject(document['info']) ? document['info'] : {};
  const operations: Operation[] = [];

  for (const [path, item] of Object.entries(document['paths'])) {
    if (!isObject(item)) continue;
    for (const method of ['get', 'post'] as const) {
      const operation = item[method];
      if (!isObject(operation)) continue;
      const params: ParamDef[] = [];

      for (const parameter of Array.isArray(operation['parameters']) ? operation['parameters'] : []) {
        if (!isObject(parameter) || parameter['in'] !== 'query') continue;
        const schema = isObject(parameter['schema']) ? parameter['schema'] : {};
        params.push(toParam(str(parameter['name']), 'query', parameter['required'] === true, schema, str(parameter['description'])));
      }

      const body = isObject(operation['requestBody']) && isObject(operation['requestBody']['content']) ? operation['requestBody']['content']['application/json'] : undefined;
      const bodySchema = isObject(body) && isObject(body['schema']) ? body['schema'] : undefined;
      if (bodySchema !== undefined && isObject(bodySchema['properties'])) {
        const required = Array.isArray(bodySchema['required']) ? bodySchema['required'] : [];
        for (const [name, schema] of Object.entries(bodySchema['properties'])) {
          if (isObject(schema)) params.push(toParam(name, 'body', required.includes(name), schema, ''));
        }
      }

      const responses = isObject(operation['responses']) ? operation['responses'] : {};
      const success = Object.entries(responses).find(([status]) => status.startsWith('2'))?.[1];
      const produces = isObject(success) && isObject(success['content']) ? Object.keys(success['content']) : [];
      const tags = Array.isArray(operation['tags']) ? operation['tags'] : [];

      operations.push({
        id: `${method.toUpperCase()} ${path}`,
        method: method === 'get' ? 'GET' : 'POST',
        path,
        summary: str(operation['summary']),
        tag: str(tags[0]) === '' ? 'API' : str(tags[0]),
        params,
        produces,
      });
    }
  }
  return { title: str(info['title']), version: str(info['version']), operations };
}

let cached: Promise<ApiSpec> | null = null;

/** Fetches and parses `/api/v1/openapi.json` once per page view. */
export function loadSpec(force = false): Promise<ApiSpec> {
  if (cached === null || force) {
    cached = fetch('/api/v1/openapi.json', { headers: { accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(parseSpec);
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

const urlParam: ParamDef = { name: 'url', where: 'query', required: true, type: 'string', description: '' };

/**
 * The five core endpoints, for the landing-page demo: it needs no form, so it
 * does not download the OpenAPI document. Only `url` (and the default
 * extraction rules) are sent.
 */
export const CORE_OPERATIONS: readonly Operation[] = (
  [
    ['meta', ['application/json']],
    ['screenshot', ['image/png']],
    ['pdf', ['application/pdf']],
    ['extract', ['application/json']],
    ['content', ['application/json']],
  ] as const
).map(([name, produces]) => ({
  id: `GET /api/v1/${name}`,
  method: 'GET' as const,
  path: `/api/v1/${name}`,
  summary: '',
  tag: '',
  params: name === 'extract' ? [urlParam, { name: 'fields', where: 'query' as const, required: true, type: 'string' as const, description: '' }] : [urlParam],
  produces,
}));

/** Last path segment: `/api/v1/meta/batch` → `batch`, `/api/v1/meta` → `meta`. */
export const shortName = (operation: Operation): string => operation.path.replace(/^\/api\/v\d+/, '') || operation.path;
