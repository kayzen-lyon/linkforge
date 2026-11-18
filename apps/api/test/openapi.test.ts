import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/create-app.js';
import { loadConfig } from '../src/config.js';
import { ErrorCode } from '../src/lib/errors.js';
import { ERROR_CATALOG } from '../src/openapi.js';

interface Parameter {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema: Record<string, unknown>;
}
interface Operation {
  operationId: string;
  parameters: Parameter[];
  responses: Record<string, { description: string; content?: Record<string, { schema: unknown }> }>;
}
interface Document {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, { get: Operation }>;
  components: { schemas: { Error: { properties: { code: { enum: string[] } } } } };
}

let app: FastifyInstance;
let doc: Document;
const registered: string[] = [];

beforeAll(async () => {
  app = await buildApp(loadConfig({ NODE_ENV: 'test' }));
  const res = await app.inject('/api/v1/openapi.json');
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('application/json');
  doc = res.json();
  // Fastify's own view of what is routable, to compare the document against.
  // (The route tree is printed without leading slashes; children are nested.)
  const stack: string[] = [];
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const match = line.match(/^([│ ]*)[├└]── (\S+)(?: \(([A-Z, ]+)\))?/);
    if (match === null) continue;
    const depth = (match[1] ?? '').length / 4;
    stack.length = depth;
    stack.push(match[2] ?? '');
    if (match[3] !== undefined) registered.push(stack.join('').replace(/^\/+/, '/'));
  }
});
afterAll(() => app.close());

const params = (path: string) =>
  Object.fromEntries(doc.paths[path]!.get.parameters.map((p) => [p.name, p]));

describe('GET /api/v1/openapi.json', () => {
  it('is an OpenAPI 3.1 document', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Omnillink API');
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('describes every API route the server actually exposes', () => {
    const api = registered.filter((path) => path.startsWith('/api/v1/'));
    expect(api.sort()).toEqual(
      [
        'check', 'content', 'extract', 'html', 'image', 'links', 'meta', 'meta/batch', 'openapi.json', 'pdf',
        'screenshot', 'sitemap', 'tech',
      ].map(
        (p) => `/api/v1/${p}`,
      ),
    );
    for (const path of [...api, '/health']) {
      const method = path.endsWith('/batch') ? 'post' : 'get';
      expect((doc.paths[path] as Record<string, unknown> | undefined)?.[method], path).toBeDefined();
      expect(app.hasRoute({ method: method === 'post' ? 'POST' : 'GET', url: path })).toBe(true);
    }
    const ids = Object.values(doc.paths).map(
      (item) => ((item as Record<string, { operationId: string }>)['get'] ?? (item as Record<string, { operationId: string }>)['post'])!.operationId,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('documents the parameters with their constraints', () => {
    expect(Object.keys(params('/api/v1/meta'))).toEqual(['url', 'render', 'embed', 'force', 'ttl']);
    expect(Object.keys(params('/api/v1/screenshot'))).toEqual([
      'url', 'device', 'width', 'height', 'fullPage', 'selector', 'hide', 'hideBanners',
      'blockAds', 'waitForSelector', 'waitFor', 'colorScheme', 'format', 'quality', 'force', 'ttl',
    ]);
    expect(Object.keys(params('/api/v1/pdf'))).toEqual([
      'url', 'format', 'landscape', 'printBackground', 'hideBanners', 'blockAds', 'waitForSelector', 'force',
      'ttl',
    ]);
    expect(Object.keys(params('/api/v1/extract'))).toEqual([
      'url', 'fields', 'render', 'waitForSelector', 'force', 'ttl',
    ]);
    expect(Object.keys(params('/api/v1/content'))).toEqual([
      'url', 'render', 'format', 'mainContent', 'include', 'exclude', 'citations',
      'waitForSelector', 'force', 'ttl',
    ]);
    expect(params('/api/v1/screenshot')['hideBanners']!.schema).toMatchObject({ default: true });
    expect(params('/api/v1/pdf')['hideBanners']!.schema).toMatchObject({ default: false });
    expect(params('/api/v1/content')['format']!.schema).toMatchObject({
      enum: ['json', 'markdown', 'text'],
      default: 'json',
    });

    const meta = params('/api/v1/meta');
    expect(meta['url']).toMatchObject({ in: 'query', required: true, schema: { type: 'string' } });
    expect(meta['render']).toMatchObject({
      required: false,
      schema: { type: 'string', enum: ['auto', 'never', 'always'], default: 'auto' },
    });
    expect(meta['ttl']!.schema).toMatchObject({ type: 'integer', minimum: 60, maximum: 86400 });
    expect(meta['url']!.schema).not.toHaveProperty('description');
    expect(meta['url']!.description).toBeTypeOf('string');

    const shot = params('/api/v1/screenshot');
    expect(shot['width']!.schema).toMatchObject({ minimum: 320, maximum: 2560 });
    expect(shot['height']!.schema).toMatchObject({ minimum: 240, maximum: 2160 });
    expect(shot['waitFor']!.schema).toMatchObject({ minimum: 0, maximum: 10000 });
    expect(shot['colorScheme']!.schema).toMatchObject({ enum: ['light', 'dark'] });
    expect(params('/api/v1/pdf')['format']!.schema).toMatchObject({ enum: ['A4', 'Letter'], default: 'A4' });
    expect(params('/api/v1/extract')['fields']!.required).toBe(true);
  });

  it('documents success and error responses', () => {
    const meta = doc.paths['/api/v1/meta']!.get.responses;
    expect(Object.keys(meta).sort()).toEqual(
      ['200', '302', '304', '400', '401', '403', '404', '429', '500', '502', '503', '504'],
    );
    expect(meta['502']!.description).toContain('EBLOCKED');
    const headers = (meta['200'] as unknown as { headers: object }).headers;
    expect(headers).toHaveProperty('etag');
    expect(headers).toHaveProperty('x-render-source');

    const batch = (doc.paths['/api/v1/meta/batch'] as unknown as Record<string, any>)['post'];
    expect(batch.requestBody.content['application/json'].schema.properties.urls).toMatchObject({
      type: 'array',
      minItems: 1,
      maxItems: 10,
    });
    expect(Object.keys(batch.responses).sort()).toEqual(['200', '400', '401', '429', '500']);
    expect(Object.keys(doc.paths['/api/v1/content']!.get.responses['200']!.content!)).toEqual([
      'application/json', 'text/markdown', 'text/plain',
    ]);
    expect(meta['404']!.description).toContain('EEMBEDNOTFOUND');
    expect(meta['400']!.content!['application/json']!.schema).toEqual({
      $ref: '#/components/schemas/Error',
    });

    expect(Object.keys(doc.paths['/api/v1/pdf']!.get.responses['200']!.content!)).toEqual(['application/pdf']);
    expect(doc.paths['/api/v1/pdf']!.get.responses['422']!.description).toContain('ETOOLARGE');
    expect(doc.paths['/api/v1/screenshot']!.get.responses['404']!.description).toContain('ESELECTORNOTFOUND');
    expect(doc.paths['/api/v1/extract']!.get.responses['422']!.description).toContain('ENOTHTML');
    expect(doc.paths['/api/v1/content']!.get.responses['422']!.description).toContain('ENOTHTML');
  });

  it('lists every error code in the shared error schema', () => {
    expect(doc.components.schemas.Error.properties.code.enum.sort()).toEqual(
      Object.values(ErrorCode).sort(),
    );
    expect(Object.keys(ERROR_CATALOG).sort()).toEqual(Object.values(ErrorCode).sort());
  });

  it('contains no dangling $ref', () => {
    const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/([^"]+)"/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const resolved = ref.split('/').reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        doc,
      );
      expect(resolved, ref).toBeDefined();
    }
  });
});
