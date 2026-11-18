/** Generates the copy-paste examples of the landing page (pure, no DOM). */

export type SnippetLang = 'curl' | 'js' | 'python';
export type EndpointName = 'meta' | 'screenshot' | 'pdf' | 'extract' | 'content';

export interface SnippetRequest {
  readonly origin: string;
  readonly endpoint: EndpointName;
  /** Query parameters in order. `fields` (extract) is passed separately. */
  readonly params: ReadonlyArray<readonly [string, string]>;
  /** Parsed extraction rules, for `/extract` only. */
  readonly fields?: unknown;
}

/** File the binary endpoints are saved to in the examples. */
function outputFile(request: SnippetRequest): string | null {
  if (request.endpoint === 'pdf') return 'page.pdf';
  if (request.endpoint !== 'screenshot') return null;
  return request.params.some(([name, value]) => name === 'format' && value === 'jpeg')
    ? 'screenshot.jpg'
    : 'screenshot.png';
}

const quote = (value: string): string => JSON.stringify(value);

function toPython(value: unknown, indent: string): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return quote(value);
  const inner = `${indent}    `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => `${inner}${toPython(item, inner)},`).join('\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const flat = entries.every(([, item]) => typeof item !== 'object' || item === null);
  if (flat && indent !== '') {
    return `{${entries.map(([key, item]) => `${quote(key)}: ${toPython(item, inner)}`).join(', ')}}`;
  }
  return `{\n${entries.map(([key, item]) => `${inner}${quote(key)}: ${toPython(item, inner)},`).join('\n')}\n${indent}}`;
}

function curl(request: SnippetRequest): string {
  const base = `${request.origin}/api/v1/${request.endpoint}`;
  if (request.endpoint === 'extract') {
    const fields = JSON.stringify(request.fields ?? {}).replace(/'/g, `'\\''`);
    const lines = [`curl -G "${base}"`];
    for (const [name, value] of request.params) lines.push(`  --data-urlencode "${name}=${value.replace(/(["\\$`])/g, '\\$1')}"`);
    lines.push(`  --data-urlencode 'fields=${fields}'`);
    return lines.join(' \\\n');
  }
  const query = new URLSearchParams(request.params.map(([name, value]) => [name, value])).toString();
  const file = outputFile(request);
  return file === null ? `curl "${base}?${query}"` : `curl -o ${file} \\\n  "${base}?${query}"`;
}

function javascript(request: SnippetRequest): string {
  const lines: string[] = [];
  if (request.endpoint === 'extract') {
    lines.push(`const fields = ${JSON.stringify(request.fields ?? {}, null, 2)};`, '');
  }
  lines.push('const params = new URLSearchParams({');
  for (const [name, value] of request.params) lines.push(`  ${name}: ${quote(value)},`);
  if (request.endpoint === 'extract') lines.push('  fields: JSON.stringify(fields),');
  lines.push('});');
  lines.push(`const response = await fetch(\`${request.origin}/api/v1/${request.endpoint}?\${params}\`);`);

  const file = outputFile(request);
  if (file === null) {
    lines.push(
      'const body = await response.json();',
      'if (body.status !== "success") {',
      '  throw new Error(`${body.code}: ${body.message}`);',
      '}',
      request.endpoint === 'content' ? 'console.log(body.data.markdown);' : 'console.log(body.data);',
    );
  } else {
    lines.push(
      'if (!response.ok) {',
      '  const error = await response.json();',
      '  throw new Error(`${error.code}: ${error.message}`);',
      '}',
      `const ${request.endpoint === 'pdf' ? 'pdf' : 'image'} = await response.blob();`,
    );
  }
  return lines.join('\n');
}

function python(request: SnippetRequest): string {
  const lines: string[] = [];
  const extract = request.endpoint === 'extract';
  if (extract) lines.push('import json', '');
  lines.push('import requests', '');
  if (extract) lines.push(`fields = ${toPython(request.fields ?? {}, '')}`, '');
  lines.push('response = requests.get(', `    "${request.origin}/api/v1/${request.endpoint}",`, '    params={');
  for (const [name, value] of request.params) lines.push(`        ${quote(name)}: ${quote(value)},`);
  if (extract) lines.push('        "fields": json.dumps(fields),');
  lines.push('    },', '    timeout=60,', ')');

  const file = outputFile(request);
  if (file === null) {
    lines.push(
      'body = response.json()',
      'if body["status"] != "success":',
      `    raise RuntimeError(f'{body["code"]}: {body["message"]}')`,
      request.endpoint === 'content' ? 'print(body["data"]["markdown"])' : 'print(body["data"])',
    );
  } else {
    lines.push(
      'if not response.ok:',
      '    error = response.json()',
      `    raise RuntimeError(f'{error["code"]}: {error["message"]}')`,
      `with open("${file}", "wb") as file:`,
      '    file.write(response.content)',
    );
  }
  return lines.join('\n');
}

export function buildSnippet(lang: SnippetLang, request: SnippetRequest): string {
  if (lang === 'curl') return curl(request);
  return lang === 'js' ? javascript(request) : python(request);
}
