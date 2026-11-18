/** Generates a runnable example of a request in eight languages, plus HTML snippets (pure). */
import type { Lang as CodeLang } from '../lib/highlight.ts';

export interface CodeRequest {
  readonly origin: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  /** Query parameters, in order. */
  readonly query: ReadonlyArray<readonly [string, string]>;
  /** JSON body of a POST. */
  readonly body?: unknown;
  /** Whether the response is a file (image, PDF) rather than JSON or text. */
  readonly binary: boolean;
  /** File name to save a binary response to. */
  readonly file: string;
  /** Whether an API key header should appear (the key itself is never printed). */
  readonly withKey: boolean;
}

export const CODE_LANGS = ['curl', 'javascript', 'sdk', 'python', 'php', 'go', 'ruby', 'rust', 'html'] as const;
export type CodeLangId = (typeof CODE_LANGS)[number];

export const CODE_LABELS: Readonly<Record<CodeLangId, string>> = {
  curl: 'curl',
  javascript: 'JavaScript',
  sdk: 'TypeScript SDK',
  python: 'Python',
  php: 'PHP',
  go: 'Go',
  ruby: 'Ruby',
  rust: 'Rust',
  html: 'HTML',
};

/** Which highlighter each example uses. */
export const CODE_SYNTAX: Readonly<Record<CodeLangId, CodeLang>> = {
  curl: 'bash',
  javascript: 'js',
  sdk: 'js',
  python: 'python',
  php: 'js',
  go: 'js',
  ruby: 'python',
  rust: 'js',
  html: 'html',
};

const KEY_ENV = 'OMNILLINK_API_KEY';
const q = (value: string): string => JSON.stringify(value);
const queryString = (request: CodeRequest): string => new URLSearchParams(request.query.map(([name, value]) => [name, value])).toString();
const fullUrl = (request: CodeRequest): string => {
  const query = queryString(request);
  return `${request.origin}${request.path}${query === '' ? '' : `?${query}`}`;
};
const baseUrl = (request: CodeRequest): string => `${request.origin}${request.path}`;
const shell = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

function curl(r: CodeRequest): string {
  const lines: string[] = [];
  const key = r.withKey ? [`  -H "x-api-key: $${KEY_ENV}"`] : [];
  if (r.method === 'POST') {
    lines.push(`curl -X POST "${baseUrl(r)}"`, '  -H "content-type: application/json"', ...key, `  -d ${shell(JSON.stringify(r.body ?? {}))}`);
  } else if (r.query.some(([, value]) => value.length > 80 || /["{]/.test(value))) {
    lines.push(`curl -G "${baseUrl(r)}"`, ...key, ...r.query.map(([name, value]) => `  --data-urlencode ${shell(`${name}=${value}`)}`));
    if (r.binary) lines.push(`  -o ${r.file}`);
  } else {
    lines.push(`curl${r.binary ? ` -o ${r.file}` : ''} "${fullUrl(r)}"`, ...key);
  }
  return lines.join(' \\\n');
}

function javascript(r: CodeRequest): string {
  const lines: string[] = [];
  const headers = [
    ...(r.method === 'POST' ? ['"content-type": "application/json"'] : []),
    ...(r.withKey ? [`"x-api-key": process.env.${KEY_ENV}`] : []),
  ];
  const init = [
    ...(r.method === 'POST' ? ['method: "POST"'] : []),
    ...(headers.length > 0 ? [`headers: { ${headers.join(', ')} }`] : []),
    ...(r.method === 'POST' ? [`body: JSON.stringify(${JSON.stringify(r.body ?? {}, null, 2).replace(/\n/g, '\n  ')})`] : []),
  ];
  if (r.query.length > 0) {
    lines.push('const params = new URLSearchParams({', ...r.query.map(([name, value]) => `  ${/^[A-Za-z_$][\w$]*$/.test(name) ? name : q(name)}: ${q(value)},`), '});');
  }
  const target = r.query.length > 0 ? `\`${baseUrl(r)}?\${params}\`` : q(baseUrl(r));
  lines.push(init.length === 0 ? `const response = await fetch(${target});` : `const response = await fetch(${target}, {\n  ${init.join(',\n  ')},\n});`);
  if (r.binary) {
    lines.push('if (!response.ok) {', '  const error = await response.json();', '  throw new Error(`${error.code}: ${error.message}`);', '}', 'const file = await response.blob();');
  } else {
    lines.push('const body = await response.json();', 'if (body.status !== "success") {', '  throw new Error(`${body.code}: ${body.message}`);', '}', 'console.log(body.data);');
  }
  return lines.join('\n');
}

// ---- TypeScript SDK ---------------------------------------------------------
// One real method of `@omnillink/sdk` per endpoint, with the option names of
// the SDK. `scripts/check-sdk-snippets.mjs` compiles a snippet per endpoint
// against the SDK sources, so a renamed method or option fails `typecheck`.

const CACHE = ['force', 'ttl'];
const PAGE = [...CACHE, 'acceptLanguage', 'userAgent', 'referer'];
const SHOT = [...PAGE, 'device', 'fullPage', 'format', 'quality', 'width', 'height', 'selector', 'waitFor', 'waitForSelector', 'click', 'scrollTo', 'colorScheme', 'hide', 'hideBanners', 'blockAds', 'frame', 'radius', 'padding', 'background'];
const PDF = [...PAGE, 'format', 'landscape', 'printBackground', 'hideBanners', 'blockAds', 'waitForSelector', 'margin', 'scale', 'pageRanges', 'headerText', 'footerText'];
const ANIMATION = [...PAGE, 'width', 'height', 'frames', 'delay', 'hideBanners', 'blockAds'];
const QR = ['format', 'size', 'margin', 'ecc', 'color', 'background'];
const OG = [...CACHE, 'title', 'description', 'site', 'author', 'label', 'template', 'theme', 'accent', 'format'];
const CONTENT = [...PAGE, 'render', 'mainContent', 'include', 'exclude', 'citations', 'waitForSelector'];
const TABLES = [...PAGE, 'render', 'selector'];

/** Options each SDK method accepts (packages/sdk/src/types.ts). */
const SDK_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  meta: [...PAGE, 'render'],
  metaEmbedUrl: [...PAGE, 'render'],
  extract: [...PAGE, 'render', 'waitForSelector'],
  extractPreset: [...PAGE, 'render', 'waitForSelector'],
  content: CONTENT,
  contentText: [...CONTENT, 'format'],
  tables: TABLES,
  tablesCsv: [...TABLES, 'table'],
  links: [...PAGE, 'render', 'scope', 'limit'],
  html: [...PAGE, 'render', 'waitForSelector'],
  tech: [...PAGE, 'render'],
  insights: [...PAGE, 'device'],
  image: CACHE,
  palette: [...CACHE, 'count'],
  favicon: PAGE,
  faviconUrl: PAGE,
  oembed: [...PAGE, 'maxWidth', 'maxHeight'],
  sitemap: [...CACHE, 'limit'],
  check: [],
  screenshot: SHOT,
  pdf: PDF,
  animation: ANIMATION,
  qr: QR,
  og: OG,
};

const SDK_NUMBERS = new Set(['ttl', 'quality', 'width', 'height', 'waitFor', 'radius', 'padding', 'margin', 'scale', 'frames', 'delay', 'table', 'limit', 'maxWidth', 'maxHeight', 'count', 'size']);
const SDK_BOOLEANS = new Set(['force', 'fullPage', 'hideBanners', 'blockAds', 'landscape', 'printBackground', 'mainContent', 'citations']);

function sdkLiteral(name: string, value: string): string {
  if (SDK_BOOLEANS.has(name) && (value === 'true' || value === 'false')) return value;
  if (SDK_NUMBERS.has(name) && /^-?\d+(\.\d+)?$/.test(value)) return value;
  return q(value);
}

function pretty(json: string | undefined): string {
  try {
    return JSON.stringify(JSON.parse(json ?? '{}'), null, 2);
  } catch {
    return '{}';
  }
}

function sdk(r: CodeRequest): string {
  const endpoint = /^\/api\/v\d+\/(.+)$/.exec(r.path)?.[1] ?? '';
  const get = (name: string): string | undefined => r.query.find(([key]) => key === name)?.[1];
  const url = get('url') ?? '';
  const head = [
    "import { createClient } from '@omnillink/sdk';",
    '',
    `const omnillink = createClient({ baseUrl: ${q(r.origin)}${r.withKey ? `, apiKey: process.env.${KEY_ENV} ?? ''` : ''} });`,
    '',
  ];
  const unsupported: string[] = [];
  /** Object literal of the options `method` accepts; `skip` lists what is passed positionally. */
  const options = (method: string, skip: readonly string[], pairs: ReadonlyArray<readonly [string, string]> = r.query): string => {
    const allowed = SDK_OPTIONS[method] ?? [];
    const lines: string[] = [];
    for (const [name, value] of pairs) {
      if (skip.includes(name)) continue;
      if (!allowed.includes(name)) unsupported.push(name);
      else lines.push(`  ${name}: ${sdkLiteral(name, value)},`);
    }
    return lines.length === 0 ? '' : `{\n${lines.join('\n')}\n}`;
  };
  const args = (...parts: readonly string[]): string => parts.filter((part) => part !== '').join(', ');
  const done = (body: readonly string[]): string =>
    [...head, ...(unsupported.length === 0 ? [] : [`// Not exposed by this SDK method: ${unsupported.join(', ')}.`]), ...body].join('\n');
  const json = (method: string, extra = '', skip: readonly string[] = ['url'], log = 'console.log(data, meta.cached);'): string => {
    const call = args(q(url), extra, options(method, skip));
    return done([`const { data, meta } = await omnillink.${method}(${call});`, log]);
  };

  switch (endpoint) {
    case 'meta': {
      const embed = get('embed');
      if (embed === undefined) return json('meta');
      const call = args(q(url), q(embed), options('metaEmbedUrl', ['url', 'embed']));
      return done(['// No request is made: the address goes straight into a `src` or `href`.', `const src = omnillink.metaEmbedUrl(${call});`]);
    }
    case 'meta/batch': {
      const body = (typeof r.body === 'object' && r.body !== null ? r.body : {}) as Record<string, unknown>;
      const urls = Array.isArray(body['urls']) ? body['urls'].filter((item): item is string => typeof item === 'string') : [];
      const opts = [
        ...(typeof body['force'] === 'boolean' ? [`  force: ${String(body['force'])},`] : []),
        ...(typeof body['ttl'] === 'number' ? [`  ttl: ${String(body['ttl'])},`] : []),
      ];
      const list = urls.length === 0 ? '[]' : `[\n${urls.map((item) => `  ${q(item)},`).join('\n')}\n]`;
      return done([
        `const { data, meta } = await omnillink.metaBatch(${args(list, opts.length === 0 ? '' : `{\n${opts.join('\n')}\n}`)});`,
        'for (const item of data) {',
        "  console.log(item.url, item.status === 'success' ? item.data.title : item.code);",
        '}',
        'console.log(meta.succeeded, meta.failed);',
      ]);
    }
    case 'extract': {
      const preset = get('preset');
      if (preset !== undefined && get('fields') === undefined) {
        return json('extractPreset', q(preset), ['url', 'preset', 'fields'], 'console.log(data.fields, data.sources);');
      }
      return json('extract', pretty(get('fields')), ['url', 'preset', 'fields'], 'console.log(data.fields, meta.source);');
    }
    case 'content': {
      const format = get('format');
      if (format !== 'markdown' && format !== 'text') return json('content', '', ['url', 'format']);
      return done([`const { data } = await omnillink.contentText(${args(q(url), options('contentText', ['url']))});`, 'console.log(data);']);
    }
    case 'tables': {
      if (get('format') !== 'csv') return json('tables', '', ['url', 'format', 'table'], 'console.log(data.tables, meta.cached);');
      return done([`const { data } = await omnillink.tablesCsv(${args(q(url), options('tablesCsv', ['url', 'format']))});`, 'console.log(data);']);
    }
    case 'html':
      return done([`const { data } = await omnillink.html(${args(q(url), options('html', ['url']))});`, '// `data` is third-party markup: never insert it into a page as HTML.', 'console.log(data.length);']);
    case 'favicon': {
      if (get('redirect') !== 'true') return json('favicon', '', ['url', 'redirect']);
      const call = args(q(url), options('faviconUrl', ['url', 'redirect']));
      return done(['// No request is made: the address answers with a redirect to the best icon.', `const src = omnillink.faviconUrl(${call});`]);
    }
    case 'check':
      return done([`const { data } = await omnillink.check(${args(q(url), options('check', ['url']))});`, 'console.log(data);']);
    case 'links':
    case 'tech':
    case 'insights':
    case 'image':
    case 'palette':
    case 'oembed':
    case 'sitemap':
      return json(endpoint);
    case 'screenshot':
    case 'pdf':
    case 'animation':
    case 'qr': {
      const call = args(q(url), options(endpoint, ['url']));
      return done([
        `const file = await omnillink.${endpoint}(${call}); // a Blob`,
        '',
        '// Or only the address, for a `src` or `href`: no request is made.',
        `const src = omnillink.${endpoint}Url(${call});`,
      ]);
    }
    case 'og': {
      const params = options('og', []);
      const call = params === '' ? '{ title: "" }' : params;
      return done([
        `const file = await omnillink.og(${call}); // a Blob`,
        '',
        '// Or only the address, for `<meta property="og:image">`: no request is made.',
        `const src = omnillink.ogUrl(${call});`,
      ]);
    }
    default:
      return `// The SDK has no method for this endpoint: use fetch.\n${javascript(r)}`;
  }
}

function python(r: CodeRequest): string {
  const lines = ['import os', '', 'import requests', ''].filter((_line, at) => r.withKey || at > 1);
  const args = [`    ${q(baseUrl(r))},`];
  if (r.query.length > 0) args.push('    params={', ...r.query.map(([name, value]) => `        ${q(name)}: ${q(value)},`), '    },');
  if (r.method === 'POST') args.push(`    json=${JSON.stringify(r.body ?? {}).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None')},`);
  if (r.withKey) args.push(`    headers={"x-api-key": os.environ["${KEY_ENV}"]},`);
  args.push('    timeout=60,');
  lines.push(`response = requests.${r.method === 'POST' ? 'post' : 'get'}(`, ...args, ')');
  if (r.binary) {
    lines.push('if not response.ok:', '    error = response.json()', `    raise RuntimeError(f'{error["code"]}: {error["message"]}')`, `with open(${q(r.file)}, "wb") as file:`, '    file.write(response.content)');
  } else {
    lines.push('body = response.json()', 'if body["status"] != "success":', `    raise RuntimeError(f'{body["code"]}: {body["message"]}')`, 'print(body["data"])');
  }
  return lines.join('\n');
}

function php(r: CodeRequest): string {
  const lines = ['<?php', ''];
  if (r.query.length > 0) lines.push('$query = http_build_query([', ...r.query.map(([name, value]) => `    ${q(name)} => ${q(value)},`), ']);');
  const headers = [...(r.method === 'POST' ? ['"content-type: application/json"'] : []), ...(r.withKey ? [`"x-api-key: " . getenv("${KEY_ENV}")`] : [])];
  lines.push(`$curl = curl_init(${q(baseUrl(r))}${r.query.length > 0 ? ' . "?" . $query' : ''});`, 'curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);');
  if (headers.length > 0) lines.push(`curl_setopt($curl, CURLOPT_HTTPHEADER, [${headers.join(', ')}]);`);
  if (r.method === 'POST') lines.push(`curl_setopt($curl, CURLOPT_POSTFIELDS, ${shell(JSON.stringify(r.body ?? {}))});`);
  lines.push('$response = curl_exec($curl);', '$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);', 'curl_close($curl);', '');
  if (r.binary) {
    lines.push('if ($status !== 200) {', '    $error = json_decode($response, true);', '    throw new RuntimeException($error["code"] . ": " . $error["message"]);', '}', `file_put_contents(${q(r.file)}, $response);`);
  } else {
    lines.push('$body = json_decode($response, true);', 'if ($body["status"] !== "success") {', '    throw new RuntimeException($body["code"] . ": " . $body["message"]);', '}', 'print_r($body["data"]);');
  }
  return lines.join('\n');
}

function go(r: CodeRequest): string {
  const imports = ['"fmt"', '"io"', '"net/http"', ...(r.query.length > 0 ? ['"net/url"'] : []), ...(r.binary || r.withKey ? ['"os"'] : []), ...(r.method === 'POST' ? ['"strings"'] : [])].sort();
  const lines = ['package main', '', 'import (', ...imports.map((name) => `\t${name}`), ')', '', 'func main() {'];
  if (r.query.length > 0) lines.push('\tparams := url.Values{}', ...r.query.map(([name, value]) => `\tparams.Set(${q(name)}, ${q(value)})`));
  const target = r.query.length > 0 ? `${q(`${baseUrl(r)}?`)}+params.Encode()` : q(baseUrl(r));
  const body = r.method === 'POST' ? `strings.NewReader(${q(JSON.stringify(r.body ?? {}))})` : 'nil';
  lines.push(`\trequest, err := http.NewRequest(${q(r.method)}, ${target}, ${body})`, '\tif err != nil {', '\t\tpanic(err)', '\t}');
  if (r.method === 'POST') lines.push('\trequest.Header.Set("content-type", "application/json")');
  if (r.withKey) lines.push(`\trequest.Header.Set("x-api-key", os.Getenv("${KEY_ENV}"))`);
  lines.push('\tresponse, err := http.DefaultClient.Do(request)', '\tif err != nil {', '\t\tpanic(err)', '\t}', '\tdefer response.Body.Close()', '', '\tdata, err := io.ReadAll(response.Body)', '\tif err != nil {', '\t\tpanic(err)', '\t}');
  if (r.binary) lines.push('\tif response.StatusCode != http.StatusOK {', '\t\tpanic(fmt.Sprintf("HTTP %d: %s", response.StatusCode, data))', '\t}', `\tif err := os.WriteFile(${q(r.file)}, data, 0o644); err != nil {`, '\t\tpanic(err)', '\t}');
  else lines.push('\tfmt.Printf("HTTP %d\\n%s\\n", response.StatusCode, data)');
  lines.push('}');
  return lines.join('\n');
}

function ruby(r: CodeRequest): string {
  const lines = ['require "json"', 'require "net/http"', '', `uri = URI(${q(baseUrl(r))})`];
  if (r.query.length > 0) lines.push('uri.query = URI.encode_www_form(', ...r.query.map(([name, value]) => `  ${q(name)} => ${q(value)},`), ')');
  lines.push(`request = Net::HTTP::${r.method === 'POST' ? 'Post' : 'Get'}.new(uri)`);
  if (r.method === 'POST') lines.push('request["content-type"] = "application/json"', `request.body = ${shell(JSON.stringify(r.body ?? {}))}`);
  if (r.withKey) lines.push(`request["x-api-key"] = ENV.fetch("${KEY_ENV}")`);
  lines.push('response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|', '  http.request(request)', 'end', '');
  if (r.binary) lines.push('raise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)', `File.binwrite(${q(r.file)}, response.body)`);
  else lines.push('body = JSON.parse(response.body)', 'raise "#{body["code"]}: #{body["message"]}" unless body["status"] == "success"', 'puts body["data"]');
  return lines.join('\n');
}

function rust(r: CodeRequest): string {
  const lines = ['// Cargo.toml: reqwest = { version = "0.12", features = ["blocking", "json"] }, serde_json = "1"', 'fn main() -> Result<(), Box<dyn std::error::Error>> {', '    let client = reqwest::blocking::Client::new();', `    let response = client`, `        .${r.method === 'POST' ? 'post' : 'get'}(${q(baseUrl(r))})`];
  if (r.query.length > 0) lines.push(`        .query(&[${r.query.map(([name, value]) => `(${q(name)}, ${q(value)})`).join(', ')}])`);
  if (r.method === 'POST') lines.push(`        .json(&serde_json::json!(${JSON.stringify(r.body ?? {})}))`);
  if (r.withKey) lines.push(`        .header("x-api-key", std::env::var("${KEY_ENV}")?)`);
  lines.push('        .send()?;');
  if (r.binary) lines.push('    let response = response.error_for_status()?;', `    std::fs::write(${q(r.file)}, response.bytes()?)?;`);
  else lines.push('    let body: serde_json::Value = response.json()?;', '    if body["status"] != "success" {', '        return Err(format!("{}: {}", body["code"], body["message"]).into());', '    }', '    println!("{:#}", body["data"]);');
  lines.push('    Ok(())', '}');
  return lines.join('\n');
}

/** Ready-to-paste markup: an image tag for image responses, and the preview card element. */
function html(r: CodeRequest): string {
  const target = r.query.find(([name]) => name === 'url')?.[1] ?? '';
  const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const blocks: string[] = [];
  if (r.method === 'GET' && r.binary && r.file.endsWith('.pdf')) blocks.push(`<a href="${escape(fullUrl(r))}">PDF</a>`);
  else if (r.method === 'GET' && r.binary) blocks.push(`<img src="${escape(fullUrl(r))}" alt="" loading="lazy" />`);
  if (/\/meta$/.test(r.path)) {
    blocks.push(`<img src="${escape(`${fullUrl(r)}&embed=image.url`)}" alt="" loading="lazy" />`);
  }
  blocks.push(
    `<script type="module">\n  import '@omnillink/sdk/element';\n</script>\n\n<link-preview url="${escape(target)}" base-url="${escape(r.origin)}"></link-preview>`,
  );
  return blocks.join('\n\n');
}

const GENERATORS: Readonly<Record<CodeLangId, (request: CodeRequest) => string>> = { curl, javascript, sdk, python, php, go, ruby, rust, html };

export const generateCode = (lang: CodeLangId, request: CodeRequest): string => GENERATORS[lang](request);
