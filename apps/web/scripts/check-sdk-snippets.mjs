/**
 * Proves the "TypeScript SDK" tab of the code generator against the real SDK.
 *
 * For every operation of the OpenAPI snapshot it asks `generateCode('sdk', …)`
 * for a snippet carrying every parameter of the operation (plus the variants
 * that map to another method: `embed`, `preset`, `format=markdown`,
 * `format=csv`, `redirect=true`), writes them to a scratch directory and
 * compiles them with `tsc --strict` against `packages/sdk/src`. A renamed
 * method, a renamed option or a wrong literal type fails `npm run typecheck`.
 *
 * Run with: node --experimental-strip-types scripts/check-sdk-snippets.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateCode } from '../src/console/codegen.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdkSource = resolve(root, '../../packages/sdk/src');
const out = join(root, 'node_modules/.cache/sdk-snippets');
const spec = JSON.parse(readFileSync(join(root, 'src/docs/openapi.snapshot.json'), 'utf8'));

/** A plausible value for a parameter, taken from the specification itself. */
function sample(schema) {
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return String(schema.examples[0]);
  if (Array.isArray(schema.enum)) return String(schema.enum[schema.enum.length - 1]);
  if (schema.default !== undefined) return String(schema.default);
  if (schema.type === 'integer' || schema.type === 'number') return String(schema.minimum ?? 1);
  if (schema.type === 'boolean') return 'true';
  return 'x';
}

const VARIANT_ONLY = { meta: ['embed'], extract: ['preset'], favicon: ['redirect'], content: ['format'], tables: ['format', 'table'] };
const VARIANTS = {
  meta: [[['embed', 'image.url']]],
  extract: [[['preset', 'article']]],
  favicon: [[['redirect', 'true']]],
  content: [[['format', 'markdown']], [['format', 'text']]],
  tables: [[['format', 'csv'], ['table', '0']]],
};

const snippets = [];
const add = (name, request) => snippets.push({ name, code: generateCode('sdk', { origin: 'https://omnillink.example', binary: false, file: 'out', withKey: snippets.length % 2 === 0, ...request }) });

for (const [path, methods] of Object.entries(spec.paths)) {
  const endpoint = /^\/api\/v\d+\/(.+)$/.exec(path)?.[1];
  if (endpoint === undefined || endpoint === 'openapi.json') continue;
  const id = endpoint.replace('/', '-');
  if (methods.post !== undefined) {
    add(id, { method: 'POST', path, query: [], body: { urls: ['https://example.com', 'https://example.org'], force: true, ttl: 60 } });
    continue;
  }
  const params = (methods.get?.parameters ?? []).filter((p) => p.in === 'query');
  const skip = VARIANT_ONLY[endpoint] ?? [];
  const base = params
    .filter((p) => !skip.includes(p.name) || (endpoint === 'extract' && p.name === 'fields'))
    .map((p) => [p.name, p.name === 'fields' ? '{"title":{"selector":"h1"},"price":{"selector":".price","type":"number"}}' : sample(p.schema ?? {})]);
  add(id, { method: 'GET', path, query: base });
  add(`${id}-min`, { method: 'GET', path, query: base.filter(([name]) => name === 'url' || name === 'title' || name === 'fields') });
  (VARIANTS[endpoint] ?? []).forEach((extra, at) => {
    const names = extra.map(([name]) => name);
    add(`${id}-v${at}`, { method: 'GET', path, query: [...base.filter(([name]) => !names.includes(name) && name !== 'fields'), ...extra] });
  });
}

const METHODS = 'meta metaBatch extract extractPreset content tables links tech insights image palette favicon oembed sitemap check html contentText tablesCsv screenshot pdf animation qr og'.split(' ');
const BUILDERS = 'screenshotUrl pdfUrl animationUrl qrUrl ogUrl faviconUrl metaEmbedUrl'.split(' ');
const all = snippets.map((snippet) => snippet.code).join('\n');
const problems = [];
for (const name of [...METHODS, ...BUILDERS]) {
  if (!new RegExp(`omnillink\\.${name}\\(`).test(all)) problems.push(`no generated snippet calls omnillink.${name}()`);
}
for (const snippet of snippets) {
  if (snippet.code.includes('has no method for this endpoint')) problems.push(`${snippet.name}: falls back to fetch`);
}
const dropped = new Map();
for (const snippet of snippets) {
  const line = /Not exposed by this SDK method: (.+)\./.exec(snippet.code);
  if (line !== null) dropped.set(snippet.name.replace(/-(min|v\d)$/, ''), line[1]);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const snippet of snippets) writeFileSync(join(out, `${snippet.name}.ts`), `${snippet.code}\nexport {};\n`);
writeFileSync(
  join(out, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      strict: true, noEmit: true, skipLibCheck: true, noUnusedLocals: false, types: ['node'],
      typeRoots: [resolve(root, '../../node_modules/@types')],
      paths: { '@omnillink/sdk': [join(sdkSource, 'index.ts')] },
    },
    include: ['*.ts'],
  }),
);

const tsc = createRequire(join(root, 'package.json')).resolve('typescript/bin/tsc');
let compiled = true;
try {
  execFileSync(process.execPath, [tsc, '-p', out], { stdio: 'pipe' });
} catch (error) {
  compiled = false;
  process.stderr.write(String(error.stdout ?? error));
}
for (const problem of problems) console.error(`sdk snippets: ${problem}`);
for (const [name, list] of dropped) console.log(`sdk snippets: ${name}: API parameters the SDK method does not take: ${list}`);
if (!compiled || problems.length > 0) {
  console.error(`sdk snippets: FAILED (${snippets.length} snippets in ${out})`);
  process.exit(1);
}
console.log(`sdk snippets: ${snippets.length} snippets compile against packages/sdk (${METHODS.length} methods, ${BUILDERS.length} URL builders all covered)`);
