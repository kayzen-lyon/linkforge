/**
 * Contract check: the built SDK against a real Omnillink API.
 *
 *   node test/contract/contract.mjs --api http://127.0.0.1:3411 [--site http://127.0.0.1:4311] [--json report.json]
 *
 * The API must be able to reach the fixture site (start it with
 * SSRF_ALLOW_PRIVATE_NETWORKS=true SSRF_ALLOWED_PORTS='*'). Without --site the
 * fixture of this folder is started on port 4311.
 *
 * Three things are compared, and every disagreement is reported:
 *
 * 1. each SDK method is called once and its result is walked against the
 *    TypeScript type the SDK declares for it (read with the compiler API, so
 *    there is no second copy of the types to drift);
 * 2. the same response is validated against the schema of the OpenAPI document;
 * 3. the parameters, error codes and response headers of the OpenAPI document
 *    are compared with the SDK's option types, error-code union and what the
 *    server actually sent.
 *
 * Exit code 0 when the SDK types match every response, 1 otherwise. Findings
 * about the OpenAPI document itself are listed but do not fail the run: they
 * are bugs of the API to report, not of the SDK.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { createClient, isOmnillinkError, responseInfo } from '../../dist/index.js';
import { startFixture } from './fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const API = arg('api', 'http://127.0.0.1:3411').replace(/\/+$/, '');
let SITE = arg('site', undefined);
const REPORT = arg('json', undefined);

// ---- 1. the SDK's types, through the compiler ------------------------------------------------

/** Result type and option type of each call, as TypeScript source. */
const TYPES = {
  meta: ['OmnillinkResult<LinkMetadata>', 'MetaOptions'],
  metaBatch: ['OmnillinkResult<readonly MetaBatchItem[], MetaBatchMeta>', 'MetaBatchOptions'],
  extract: [
    'OmnillinkResult<ExtractData<{ heading: { selector: string }; price: { selector: string; type: "number" }; links: { selector: string; attr: string; type: "url"; all: true } }>>',
    'ExtractOptions',
  ],
  'extractPreset:article': ['OmnillinkResult<PresetData<"article">>', 'ExtractOptions'],
  'extractPreset:product': ['OmnillinkResult<PresetData<"product">>', 'ExtractOptions'],
  'extractPreset:recipe': ['OmnillinkResult<PresetData<"recipe">>', 'ExtractOptions'],
  'extractPreset:event': ['OmnillinkResult<PresetData<"event">>', 'ExtractOptions'],
  content: ['OmnillinkResult<ReadableContent>', 'ContentOptions'],
  tables: ['OmnillinkResult<TablesData>', 'TablesOptions'],
  links: ['OmnillinkResult<LinksData>', 'LinksOptions'],
  tech: ['OmnillinkResult<TechData>', 'TechOptions'],
  insights: ['OmnillinkResult<InsightsData>', 'InsightsOptions'],
  image: ['OmnillinkResult<ImageData>', 'ImageOptions'],
  palette: ['OmnillinkResult<PaletteData>', 'PaletteOptions'],
  favicon: ['OmnillinkResult<FaviconData>', 'FaviconOptions'],
  oembed: ['OmnillinkResult<OembedData>', 'OembedOptions'],
  sitemap: ['OmnillinkResult<SitemapData>', 'SitemapOptions'],
  check: ['OmnillinkResult<LinkCheck, CheckMeta>', '{}'],
  html: ['OmnillinkText', 'HtmlOptions'],
  contentText: ['OmnillinkText', 'ContentTextOptions'],
  tablesCsv: ['OmnillinkText', 'TablesCsvOptions'],
  notModified: ['NotModified', '{}'],
  screenshot: ['Blob', 'ScreenshotOptions'],
  pdf: ['Blob', 'PdfOptions'],
  animation: ['Blob', 'AnimationOptions'],
  qr: ['Blob', 'QrOptions'],
  og: ['Blob', 'OgOptions'],
};

const ident = (name) => name.replace(/[^A-Za-z0-9]/g, '_');
const VIRTUAL = join(here, '__contract_types.ts');
const virtualSource = [
  "import type * as S from '../../src/index.js';",
  ...Object.entries(TYPES).flatMap(([name, [result, options]]) => {
    const scoped = (source) => source.replace(/\b([A-Z][A-Za-z]+)\b(?!["'])/g, (word) => (word === 'Blob' ? 'Blob' : `S.${word}`));
    return [`export type R_${ident(name)} = ${scoped(result)};`, `export type O_${ident(name)} = ${scoped(options)};`];
  }),
  'export type Codes = S.ApiErrorCode;',
  'export type Categories = S.KnownTechCategory;',
  'export type Info = S.ResponseInfo;',
].join('\n');

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  types: [],
};
const host = ts.createCompilerHost(compilerOptions);
const readFile = host.readFile.bind(host);
const fileExists = host.fileExists.bind(host);
const getSourceFile = host.getSourceFile.bind(host);
host.fileExists = (file) => file === VIRTUAL || fileExists(file);
host.readFile = (file) => (file === VIRTUAL ? virtualSource : readFile(file));
host.getSourceFile = (file, languageVersion, ...rest) =>
  file === VIRTUAL ? ts.createSourceFile(file, virtualSource, languageVersion, true) : getSourceFile(file, languageVersion, ...rest);
const program = ts.createProgram([VIRTUAL], compilerOptions, host);
const checker = program.getTypeChecker();
const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName === VIRTUAL);
if (diagnostics.length > 0) {
  for (const d of diagnostics) console.error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  process.exit(2);
}
const exported = new Map(checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(VIRTUAL))).map((s) => [s.name, s]));
const typeOf = (name) => checker.getDeclaredTypeOfSymbol(exported.get(name));

const F = ts.TypeFlags;
const show = (value) => {
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text.length > 60 ? `${text.slice(0, 57)}…` : text;
};

/** Walks `value` along `type`; returns the list of places where they disagree. */
function walk(type, value, path) {
  if (type.flags & (F.Any | F.Unknown)) return [];
  if (type.isUnion()) {
    const attempts = type.types.map((member) => walk(member, value, path));
    if (attempts.some((problems) => problems.length === 0)) return [];
    // The member that fits best explains the mismatch best.
    const best = attempts.reduce((a, b) => (b.length < a.length ? b : a));
    const shallow = best.every((problem) => problem.startsWith(`${path}:`));
    return shallow ? [`${path}: ${show(value)} is not ${checker.typeToString(type)}`] : best;
  }
  if (type.flags & F.Null) return value === null ? [] : [`${path}: expected null, got ${show(value)}`];
  if (type.flags & F.Undefined) return value === undefined ? [] : [`${path}: expected undefined, got ${show(value)}`];
  if (type.isStringLiteral() || type.isNumberLiteral()) {
    return value === type.value ? [] : [`${path}: expected ${show(type.value)}, got ${show(value)}`];
  }
  if (type.flags & F.BooleanLiteral) {
    const expected = checker.typeToString(type) === 'true';
    return value === expected ? [] : [`${path}: expected ${expected}, got ${show(value)}`];
  }
  if (type.flags & F.String) return typeof value === 'string' ? [] : [`${path}: expected a string, got ${show(value)}`];
  if (type.flags & F.Number) return typeof value === 'number' && Number.isFinite(value) ? [] : [`${path}: expected a number, got ${show(value)}`];
  if (type.flags & F.Boolean) return typeof value === 'boolean' ? [] : [`${path}: expected a boolean, got ${show(value)}`];
  // `string & {}`: an open string union.
  if (type.isIntersection() && type.types.some((member) => member.flags & F.String)) {
    return typeof value === 'string' ? [] : [`${path}: expected a string, got ${show(value)}`];
  }
  if (checker.isTupleType(type)) {
    const items = checker.getTypeArguments(type);
    if (!Array.isArray(value) || value.length !== items.length) return [`${path}: expected a tuple of ${items.length}, got ${show(value)}`];
    return items.flatMap((item, index) => walk(item, value[index], `${path}[${index}]`));
  }
  if (checker.isArrayType(type)) {
    if (!Array.isArray(value)) return [`${path}: expected an array, got ${show(value)}`];
    const [item] = checker.getTypeArguments(type);
    return value.flatMap((entry, index) => walk(item, entry, `${path}[${index}]`));
  }
  if (type.flags & (F.Object | F.Intersection)) {
    if (checker.typeToString(type) === 'Blob') return value instanceof Blob ? [] : [`${path}: expected a Blob, got ${show(value)}`];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: expected an object, got ${show(value)}`];
    const problems = [];
    const properties = checker.getPropertiesOfType(type);
    const index = checker.getIndexInfosOfType(type)[0];
    const known = new Set();
    for (const property of properties) {
      known.add(property.name);
      const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
      if (!(property.name in value)) {
        if (!optional) problems.push(`${path}.${property.name}: missing in the response`);
        continue;
      }
      problems.push(...walk(checker.getTypeOfSymbol(property), value[property.name], `${path}.${property.name}`));
    }
    for (const key of Object.keys(value)) {
      if (known.has(key)) continue;
      if (index === undefined) problems.push(`${path}.${key}: in the response but not in the type (${show(value[key])})`);
      else problems.push(...walk(index.type, value[key], `${path}.${key}`));
    }
    return problems;
  }
  return [`${path}: type ${checker.typeToString(type)} is not handled by the walker`];
}

// ---- 2. the OpenAPI document -----------------------------------------------------------------

const openapi = await (await fetch(`${API}/api/v1/openapi.json`)).json();

/** A JSON Schema validator for the subset the document uses. */
function validate(schema, value, path) {
  if (schema === undefined || schema === null || Object.keys(schema).length === 0) return [];
  if (schema.anyOf !== undefined) {
    const attempts = schema.anyOf.map((member) => validate(member, value, path));
    if (attempts.some((problems) => problems.length === 0)) return [];
    return attempts.reduce((a, b) => (b.length < a.length ? b : a));
  }
  if ('const' in schema) return value === schema.const ? [] : [`${path}: expected ${show(schema.const)}, got ${show(value)}`];
  if (schema.enum !== undefined && !schema.enum.includes(value)) return [`${path}: ${show(value)} is not one of ${show(schema.enum)}`];
  switch (schema.type) {
    case 'null':
      return value === null ? [] : [`${path}: expected null, got ${show(value)}`];
    case 'string':
      return typeof value === 'string' ? [] : [`${path}: expected a string, got ${show(value)}`];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path}: expected a boolean, got ${show(value)}`];
    case 'integer':
    case 'number': {
      if (typeof value !== 'number') return [`${path}: expected ${schema.type}, got ${show(value)}`];
      const problems = [];
      if (schema.type === 'integer' && !Number.isInteger(value)) problems.push(`${path}: expected an integer, got ${value}`);
      if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${path}: ${value} is below the minimum ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${path}: ${value} is above the maximum ${schema.maximum}`);
      return problems;
    }
    case 'array': {
      if (!Array.isArray(value)) return [`${path}: expected an array, got ${show(value)}`];
      const problems = [];
      if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${path}: fewer than ${schema.minItems} items`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${path}: more than ${schema.maxItems} items`);
      return [...problems, ...value.flatMap((item, index) => validate(schema.items, item, `${path}[${index}]`))];
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path}: expected an object, got ${show(value)}`];
      const problems = [];
      for (const name of schema.required ?? []) {
        if (!(name in value)) problems.push(`${path}.${name}: required by the document, missing in the response`);
      }
      const pattern = schema.patternProperties === undefined ? undefined : Object.values(schema.patternProperties)[0];
      for (const [key, item] of Object.entries(value)) {
        const property = schema.properties?.[key];
        if (property !== undefined) problems.push(...validate(property, item, `${path}.${key}`));
        else if (pattern !== undefined) problems.push(...validate(pattern, item, `${path}.${key}`));
        else if (schema.properties !== undefined) problems.push(`${path}.${key}: in the response but not in the document`);
      }
      return problems;
    }
    default:
      return [];
  }
}

const operation = (path, method = 'get') => openapi.paths[`/api/v1/${path}`]?.[method];
const jsonSchema = (path, method) => operation(path, method)?.responses?.['200']?.content?.['application/json']?.schema;

// ---- 3. the calls ----------------------------------------------------------------------------

let fixture;
if (SITE === undefined) {
  fixture = await startFixture(4311);
  SITE = 'http://127.0.0.1:4311';
}
SITE = SITE.replace(/\/+$/, '');
const client = createClient({ baseUrl: API, timeoutMs: 90_000 });

/** @type {{ call: string, endpoint: string, ok: boolean, sdk: string[], openapi: string[], headers: Record<string,string>, note: string }[]} */
const rows = [];
const findings = [];
const observedHeaders = new Map();

async function run(call, endpoint, invoke, { method = 'get', describe = () => '' } = {}) {
  const row = { call, endpoint, ok: false, sdk: [], openapi: [], headers: {}, note: '' };
  rows.push(row);
  try {
    const result = await invoke();
    const info = responseInfo(result);
    row.headers = info ?? {};
    observedHeaders.set(endpoint, info);
    row.sdk = walk(typeOf(`R_${ident(call)}`), result, 'result');
    const schema = jsonSchema(endpoint, method);
    if (schema !== undefined && result !== null && typeof result === 'object' && 'meta' in result && result.meta !== undefined) {
      row.openapi = validate(schema, { status: 'success', data: result.data, meta: result.meta }, 'body');
    }
    row.ok = row.sdk.length === 0;
    row.note = describe(result);
    return result;
  } catch (error) {
    row.sdk = [isOmnillinkError(error) ? `threw ${error.code} (HTTP ${error.status}): ${error.message}` : `threw ${String(error)}`];
    return undefined;
  }
}

async function expectError(call, code, invoke) {
  const row = { call, endpoint: '-', ok: false, sdk: [], openapi: [], headers: {}, note: '' };
  rows.push(row);
  try {
    await invoke();
    row.sdk = [`expected ${code}, but the call succeeded`];
  } catch (error) {
    if (!isOmnillinkError(error)) {
      row.sdk = [`expected ${code}, got ${String(error)}`];
      return undefined;
    }
    row.ok = error.code === code;
    if (!row.ok) row.sdk = [`expected ${code}, got ${error.code} (HTTP ${error.status}): ${error.message}`];
    row.note = `HTTP ${error.status}, retryable=${error.retryable}, retryAfter=${error.retryAfter ?? '—'}, requestId=${error.requestId === undefined ? 'absent' : 'present'}`;
    return error;
  }
  return undefined;
}

const home = `${SITE}/`;
const blobNote = (blob) => `${blob.type}, ${blob.size} bytes`;

await run('meta', 'meta', () => client.meta(home), { describe: (r) => `title=${show(r.data.title)}` });
await run('metaBatch', 'meta/batch', () => client.metaBatch([home, `${SITE}/product`, `${SITE}/gone`, 'ftp://nope.example/']), {
  method: 'post',
  describe: (r) => r.data.map((item) => (item.status === 'success' ? 'success' : `${item.status}:${item.code}`)).join(', '),
});
await run(
  'extract',
  'extract',
  () =>
    client.extract(home, {
      heading: { selector: 'h1' },
      price: { selector: '#prices tbody tr:nth-child(2) td:nth-child(2)', type: 'number' },
      links: { selector: 'article a', attr: 'href', type: 'url', all: true },
    }),
  { describe: (r) => show(r.data.fields) },
);
for (const [preset, page] of [['article', ''], ['product', 'product'], ['recipe', 'recipe'], ['event', 'event']]) {
  await run(`extractPreset:${preset}`, 'extract', () => client.extractPreset(`${SITE}/${page}`, preset), {
    describe: (r) => `schemaType=${r.data.schemaType}, ${Object.values(r.data.fields).filter((v) => v !== null).length}/${Object.keys(r.data.fields).length} fields set`,
  });
}
await run('content', 'content', () => client.content(home, { citations: true }), {
  describe: (r) => `${r.data.wordCount} words, ${r.data.links.length} links, ${r.data.images.length} images, truncated=${r.data.truncated}`,
});
await run('tables', 'tables', () => client.tables(home), { describe: (r) => `${r.data.total} table(s), headers=${show(r.data.tables[0]?.headers)}` });
await run('links', 'links', () => client.links(home), { describe: (r) => `${r.data.total} links, ${r.data.internal} internal, ${r.data.external} external` });
await run('tech', 'tech', () => client.tech(home, { render: 'never' }), { describe: (r) => r.data.technologies.map((t) => `${t.name}${t.version === null ? '' : ` ${t.version}`}`).join(', ') });
await run('insights', 'insights', () => client.insights(home), { describe: (r) => `${r.data.network.requests} requests, ${r.data.network.transferBytes} bytes, loaded=${r.data.loaded}` });
await run('image', 'image', () => client.image(home), { describe: (r) => `${r.data.format} ${r.data.width}×${r.data.height}, ${r.data.bytes} bytes` });
await run('palette', 'palette', () => client.palette(home, { count: 3 }), { describe: (r) => `dominant=${r.data.dominant}, ${r.data.colors.map((c) => c.hex).join(' ')}` });
await run('favicon', 'favicon', () => client.favicon(home), { describe: (r) => `${r.data.icon.rel} ${r.data.icon.width}×${r.data.icon.height}, ${r.data.icons.length} measured` });
await run('oembed', 'oembed', () => client.oembed(home, { maxWidth: 600 }), { describe: (r) => `type=${r.data.type}, provider=${show(r.data.providerName)}` });
await run('sitemap', 'sitemap', () => client.sitemap(home), { describe: (r) => `${r.data.sitemaps.length} file(s), ${r.data.urlCount} URLs, errors=${show(r.data.sitemaps.map((s) => s.error).filter(Boolean))}` });
await run('check', 'check', () => client.check(`${SITE}/old`), { describe: (r) => r.data.redirects.map((hop) => hop.status).join(' → ') });
await run('html', 'html', () => client.html(home, { render: 'never' }), { describe: (r) => `${r.data.length} characters, finalUrl=${r.response.finalUrl}` });
await run('contentText', 'content', () => client.contentText(home), { describe: (r) => `${r.data.length} characters of Markdown` });
await run('tablesCsv', 'tables', () => client.tablesCsv(home), { describe: (r) => show(r.data.split('\r\n').at(-2)) });
await run('screenshot', 'screenshot', () => client.screenshot(home, { format: 'jpeg', quality: 50, frame: 'browser', padding: 20 }), { describe: blobNote });
await run('pdf', 'pdf', () => client.pdf(home, { footerText: 'Page {page} / {pages}', margin: 10 }), { describe: blobNote });
await run('animation', 'animation', () => client.animation(home, { frames: 3, width: 400, height: 300 }), {
  describe: (blob) => `${blobNote(blob)}, frames=${responseInfo(blob)?.animationFrames}`,
});
await run('qr', 'qr', () => client.qr(home), { describe: (blob) => `${blobNote(blob)}, version=${responseInfo(blob)?.qrVersion}` });
await run('og', 'og', () => client.og({ title: 'Contract check', site: 'Omnillink', template: 'gradient' }), { describe: blobNote });

// Conditional requests: every JSON and text method that returned an etag.
const first = await client.meta(home);
await run('notModified', 'meta', () => client.meta(home, { ifNoneMatch: first.response.etag ?? '' }), { describe: (r) => `status=${r.response.status}` });
const conditional = {
  content: (etag) => client.content(home, { citations: true, ifNoneMatch: etag }),
  links: (etag) => client.links(home, { ifNoneMatch: etag }),
  tables: (etag) => client.tables(home, { ifNoneMatch: etag }),
  tech: (etag) => client.tech(home, { render: 'never', ifNoneMatch: etag }),
  favicon: (etag) => client.favicon(home, { ifNoneMatch: etag }),
  oembed: (etag) => client.oembed(home, { maxWidth: 600, ifNoneMatch: etag }),
  sitemap: (etag) => client.sitemap(home, { ifNoneMatch: etag }),
  image: (etag) => client.image(home, { ifNoneMatch: etag }),
  palette: (etag) => client.palette(home, { count: 3, ifNoneMatch: etag }),
  insights: (etag) => client.insights(home, { ifNoneMatch: etag }),
  html: (etag) => client.html(home, { render: 'never', ifNoneMatch: etag }),
};
for (const [name, again] of Object.entries(conditional)) {
  const etag = observedHeaders.get(name)?.etag;
  if (typeof etag !== 'string') {
    findings.push(`${name}: no etag on the response, although the OpenAPI document ${operation(name)?.responses?.['304'] === undefined ? 'does not document' : 'documents'} a 304`);
    continue;
  }
  const outcome = await again(etag).catch((error) => error);
  if (outcome?.notModified !== true) findings.push(`${name}: sending its etag back did not yield 304 (${isOmnillinkError(outcome) ? outcome.code : 'got data'})`);
}

// Error codes, for real.
await expectError('error: EEMBEDNOTFOUND (oembed of a page without one)', 'EEMBEDNOTFOUND', () => client.oembed(`${SITE}/plain`));
await expectError('error: ETARGETSTATUS (meta of a 404)', 'ETARGETSTATUS', () => client.meta(`${SITE}/gone`));
await expectError('error: EFORBIDDENURL or EINVALIDURL (file: scheme)', 'EINVALIDURL', () => client.meta('file:///etc/passwd'));
await expectError('error: EINVALIDPARAMS (ttl too low)', 'EINVALIDPARAMS', () => client.meta(home, { ttl: 1 }));
await expectError('error: ESELECTORNOTFOUND (screenshot selector)', 'ESELECTORNOTFOUND', () => client.screenshot(home, { selector: '#does-not-exist' }));
await expectError('error: EBLOCKED (challenge page)', 'EBLOCKED', () => client.content(`${SITE}/blocked`));
// A closed port, hit until the circuit breaker opens (threshold 5 by default).
let circuit;
for (let attempt = 0; attempt < 8 && circuit?.code !== 'ECIRCUITOPEN'; attempt += 1) {
  circuit = await client.check('http://127.0.0.1:9/').catch((error) => error);
}
await expectError('error: ECIRCUITOPEN (after repeated failures)', 'ECIRCUITOPEN', () => client.check('http://127.0.0.1:9/'));
if (circuit?.code === 'ECIRCUITOPEN' && circuit.retryAfter === undefined) {
  findings.push(`ECIRCUITOPEN: the delay is only in the message (${show(circuit.message)}); no Retry-After header is sent`);
}

// ---- 4. document vs SDK ----------------------------------------------------------------------

/** Parameters of an endpoint that the SDK takes another way than through the options object. */
const ELSEWHERE = {
  meta: { embed: 'metaEmbedUrl(path)' },
  extract: { fields: 'extract(fields)', preset: 'extractPreset(preset)' },
  content: { format: 'contentText()' },
  tables: { format: 'tablesCsv()', table: 'tablesCsv()' },
  favicon: { redirect: 'faviconUrl()' },
};
const OPTION_TYPES = {
  meta: 'meta', screenshot: 'screenshot', pdf: 'pdf', animation: 'animation', extract: 'extract', content: 'contentText',
  tables: 'tablesCsv', links: 'links', html: 'html', tech: 'tech', insights: 'insights', favicon: 'favicon', oembed: 'oembed',
  palette: 'palette', qr: 'qr', og: 'og', image: 'image', sitemap: 'sitemap', check: 'check',
};
const sdkMismatches = [];
for (const [endpoint, call] of Object.entries(OPTION_TYPES)) {
  const documented = new Set((operation(endpoint)?.parameters ?? []).map((parameter) => parameter.name));
  if (documented.size === 0) {
    findings.push(`/${endpoint}: not in the OpenAPI document`);
    continue;
  }
  const options = new Set(checker.getPropertiesOfType(typeOf(`O_${ident(call)}`)).map((property) => property.name));
  for (const name of documented) {
    if (name === 'url' || options.has(name) || ELSEWHERE[endpoint]?.[name] !== undefined) continue;
    sdkMismatches.push(`/${endpoint}: parameter \`${name}\` is in the OpenAPI document but not in the SDK options`);
  }
  for (const name of options) {
    if (!documented.has(name)) sdkMismatches.push(`/${endpoint}: option \`${name}\` is in the SDK but not in the OpenAPI document`);
  }
}
const batchBody = operation('meta/batch', 'post')?.requestBody?.content?.['application/json']?.schema?.properties ?? {};
for (const name of Object.keys(batchBody)) {
  if (name !== 'urls' && !checker.getPropertiesOfType(typeOf('O_metaBatch')).some((property) => property.name === name)) {
    sdkMismatches.push(`/meta/batch: body property \`${name}\` is not in the SDK options`);
  }
}
for (const path of Object.keys(openapi.paths)) {
  const name = path.replace('/api/v1/', '');
  if (path.startsWith('/api/v1/') && name !== 'openapi.json' && name !== 'meta/batch' && OPTION_TYPES[name] === undefined) {
    sdkMismatches.push(`${path}: documented, but the SDK has no method for it`);
  }
}

const documentedCodes = new Set(openapi.components.schemas.Error.properties.code.enum);
const sdkCodes = new Set(typeOf('Codes').types.map((member) => member.value));
for (const code of documentedCodes) if (!sdkCodes.has(code)) sdkMismatches.push(`error code ${code} is in the OpenAPI document but not in ApiErrorCode`);
for (const code of sdkCodes) if (!documentedCodes.has(code)) sdkMismatches.push(`error code ${code} is in ApiErrorCode but not in the OpenAPI document`);

const documentedCategories = new Set(jsonSchema('tech').properties.data.properties.technologies.items.properties.category.enum);
const sdkCategories = new Set(typeOf('Categories').types.map((member) => member.value));
for (const category of documentedCategories) if (!sdkCategories.has(category)) sdkMismatches.push(`tech category ${category} is documented but not in TechCategory`);
for (const category of sdkCategories) if (!documentedCategories.has(category)) sdkMismatches.push(`tech category ${category} is in TechCategory but not documented`);

// Headers the document promises on a 200, against what came back.
const HEADER_FIELDS = { 'x-cache': 'cache', 'x-render-source': 'renderSource', etag: 'etag', 'x-request-id': 'requestId', 'x-final-url': 'finalUrl', 'x-animation-frames': 'animationFrames', 'x-qr-version': 'qrVersion' };
for (const [endpoint, info] of observedHeaders) {
  if (info === undefined) continue;
  const method = endpoint === 'meta/batch' ? 'post' : 'get';
  const documented = Object.keys(operation(endpoint, method)?.responses?.['200']?.headers ?? {});
  for (const [headerName, field] of Object.entries(HEADER_FIELDS)) {
    const present = info[field] !== null;
    if (documented.includes(headerName) && !present) findings.push(`/${endpoint}: header \`${headerName}\` is documented on 200 but was not sent`);
    if (!documented.includes(headerName) && present) findings.push(`/${endpoint}: header \`${headerName}\` was sent but is not documented on 200`);
  }
  if (info.rateLimit === null && endpoint !== 'meta/batch') findings.push(`/${endpoint}: no x-ratelimit-* header`);
}
if (!Object.values(openapi.paths).some((item) => Object.values(item).some((op) => Object.keys(op.responses?.['200']?.headers ?? {}).some((name) => name.startsWith('x-ratelimit'))))) {
  findings.push('x-ratelimit-limit / x-ratelimit-remaining / x-ratelimit-reset are sent on every response but documented on none in the OpenAPI document');
}

// ---- report ----------------------------------------------------------------------------------

fixture?.close();
const failed = rows.filter((row) => !row.ok);
const mark = (ok) => (ok ? 'ok  ' : 'FAIL');
console.log(`Contract check — SDK against ${API} (OpenAPI ${openapi.info.version}), fixture ${SITE}\n`);
for (const row of rows) {
  const info = row.headers;
  const headers = info.status === undefined ? '' : `  [${info.cache ?? '-'} ${info.renderSource ?? '-'} etag:${info.etag === null ? 'no' : 'yes'} remaining:${info.rateLimit?.remaining ?? '-'}]`;
  console.log(`${mark(row.ok)} ${row.call.padEnd(24)} ${row.note}${headers}`);
  for (const problem of row.sdk) console.log(`       SDK type    ✗ ${problem}`);
  for (const problem of row.openapi) console.log(`       OpenAPI doc ✗ ${problem}`);
}
const openapiProblems = rows.flatMap((row) => row.openapi.map((problem) => `${row.call}: ${problem}`));
console.log(`\nSDK types vs responses: ${rows.length - failed.length}/${rows.length} calls match`);
console.log(`SDK vs OpenAPI document (parameters, error codes, enums): ${sdkMismatches.length === 0 ? 'no difference' : ''}`);
for (const line of sdkMismatches) console.log(`  ✗ ${line}`);
console.log(`OpenAPI document vs real responses: ${openapiProblems.length + findings.length === 0 ? 'no difference' : `${openapiProblems.length + findings.length} finding(s)`}`);
for (const line of [...new Set([...openapiProblems, ...findings])]) console.log(`  • ${line}`);

if (REPORT !== undefined) await writeFile(REPORT, JSON.stringify({ api: API, openapi: openapi.info.version, rows, sdkMismatches, findings }, null, 2));
process.exitCode = failed.length === 0 && sdkMismatches.length === 0 ? 0 : 1;
