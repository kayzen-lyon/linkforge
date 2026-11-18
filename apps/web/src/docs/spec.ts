/**
 * The API reference content, as data.
 *
 * `render.ts` turns this into static HTML at build time. Descriptions accept a
 * tiny inline syntax: `code` and [label](href). Keep every statement in sync
 * with the API implementation (apps/api): this is the documentation users rely on.
 */
import type { Lang } from '../lib/highlight';

/** Origin used in the examples; the page swaps it for the real origin at runtime. */
export const EXAMPLE_ORIGIN = 'http://localhost:3000';
const TARGET = 'https://example.com/blog/launch';
const ENCODED_TARGET = encodeURIComponent(TARGET);

export interface Param {
  readonly name: string;
  readonly type: string;
  /** Default value, or `required`. Omitted when there is no default. */
  readonly fallback?: string;
  readonly required?: boolean;
  readonly description: string;
}

export interface Sample {
  readonly label: string;
  readonly lang: Lang;
  readonly code: string;
}

export interface Endpoint {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly returns: string;
  readonly intro: readonly string[];
  readonly params: readonly Param[];
  readonly notes?: readonly string[];
  readonly samples: readonly Sample[];
}

const URL_PARAM: Param = {
  name: 'url',
  type: 'string',
  required: true,
  description:
    'Absolute `http` or `https` URL of the page, URL-encoded. At most 2,048 characters, and it must not contain credentials.',
};

const RENDER_PARAM: Param = {
  name: 'render',
  type: '`auto` | `never` | `always`',
  fallback: 'auto',
  description:
    '`auto` fetches the page over plain HTTP and opens a headless browser only when the result is poor or the page is an empty single-page-app shell. `never` stays on plain HTTP. `always` renders in the browser. See [Rendering](#rendering).',
};

const FORCE_PARAM: Param = {
  name: 'force',
  type: 'boolean',
  fallback: 'false',
  description:
    'Skip the cache read and process the page again. The fresh result replaces the cached one.',
};

const TTL_PARAM: Param = {
  name: 'ttl',
  type: 'integer (seconds)',
  fallback: 'server setting',
  description:
    'How long this result is kept in the cache, in seconds. Without it the server default applies. See [Caching](#caching).',
};

const json = (value: unknown): string => JSON.stringify(value, null, 2);

export const ENDPOINTS: readonly Endpoint[] = [
  {
    id: 'meta',
    path: '/api/v1/meta',
    title: 'Metadata',
    returns: 'application/json',
    intro: [
      'Returns normalised metadata for a page, merged from Open Graph, Twitter Card, JSON-LD, standard HTML tags and feeds. Use it to build link previews, enrich bookmarks or index pages.',
      'Fields that the page does not provide are `null`, or an empty array for list fields.',
    ],
    params: [
      URL_PARAM,
      RENDER_PARAM,
      FORCE_PARAM,
      TTL_PARAM,
      {
        name: 'embed',
        type: 'string',
        description:
          'Dot path to a URL inside `data`, such as `image.url`, `logo.url` or `favicon`. Instead of JSON, the API answers with a redirect to that URL, so the request works directly as an `<img src>`. If the page has no value at that path the API answers with a 404 error.',
      },
    ],
    samples: [
      { label: 'Request', lang: 'bash', code: `curl "${EXAMPLE_ORIGIN}/api/v1/meta?url=${ENCODED_TARGET}"` },
      {
        label: 'Response',
        lang: 'json',
        code: json({
          status: 'success',
          data: {
            url: TARGET,
            canonicalUrl: TARGET,
            title: 'Launching the new editor',
            description: 'What changed in the editor, and how to migrate your documents.',
            author: 'Ada Example',
            publisher: 'Example Blog',
            lang: 'en',
            date: '2025-03-04T09:00:00.000Z',
            image: {
              url: 'https://example.com/img/launch.png',
              width: 1200,
              height: 630,
              type: 'image/png',
              alt: 'The new editor',
            },
            images: [
              {
                url: 'https://example.com/img/launch.png',
                width: 1200,
                height: 630,
                type: 'image/png',
                alt: 'The new editor',
              },
            ],
            favicon: 'https://example.com/favicon.ico',
            logo: { url: 'https://example.com/logo.png' },
            video: null,
            audio: null,
            keywords: ['editor', 'release'],
            feeds: ['https://example.com/feed.xml'],
            jsonLd: [{ '@type': 'BlogPosting', headline: 'Launching the new editor' }],
            contentType: 'text/html',
          },
          meta: { cached: false, source: 'http', durationMs: 132 },
        }),
      },
      {
        label: 'Use a field as an image',
        lang: 'html',
        code: `<img src="${EXAMPLE_ORIGIN}/api/v1/meta?url=${ENCODED_TARGET}&embed=image.url" alt="" />`,
      },
    ],
  },
  {
    id: 'screenshot',
    path: '/api/v1/screenshot',
    title: 'Screenshot',
    returns: 'image/png or image/jpeg',
    intro: [
      'Renders the page in a headless browser and returns the image itself, not JSON. The request URL can be used directly as an `<img src>`.',
    ],
    params: [
      URL_PARAM,
      {
        name: 'device',
        type: '`desktop` | `mobile`',
        fallback: 'desktop',
        description:
          '`desktop` uses a 1280 × 800 viewport. `mobile` emulates a phone (Pixel 7 profile: touch, mobile user agent, high pixel density).',
      },
      {
        name: 'width',
        type: 'integer (px)',
        fallback: 'from `device`',
        description: 'Viewport width, overriding the device preset.',
      },
      {
        name: 'height',
        type: 'integer (px)',
        fallback: 'from `device`',
        description: 'Viewport height, overriding the device preset.',
      },
      {
        name: 'fullPage',
        type: 'boolean',
        fallback: 'false',
        description:
          'Capture the whole scrollable page instead of the viewport. Very tall pages are capped at 12,000 px.',
      },
      {
        name: 'selector',
        type: 'string',
        description: 'CSS selector of a single element to capture instead of the page.',
      },
      {
        name: 'format',
        type: '`png` | `jpeg`',
        fallback: 'png',
        description: 'Image format of the response.',
      },
      {
        name: 'quality',
        type: 'integer 1–100',
        fallback: '80',
        description: 'JPEG quality. Ignored for PNG.',
      },
      {
        name: 'colorScheme',
        type: '`light` | `dark`',
        fallback: 'light',
        description: 'Value reported to the page for `prefers-color-scheme`.',
      },
      {
        name: 'hide',
        type: 'string',
        description:
          'Comma-separated CSS selectors to hide before capturing, for example cookie banners: `hide=.cookie-banner,#newsletter`.',
      },
      {
        name: 'waitFor',
        type: 'integer (ms)',
        fallback: '0',
        description: 'Extra time to wait after the page has loaded, for late animations or lazy content.',
      },
      FORCE_PARAM,
      TTL_PARAM,
    ],
    notes: [
      'Errors are still returned as JSON with the matching HTTP status, so check the status code (or the `content-type` header) before treating the body as an image.',
    ],
    samples: [
      {
        label: 'Request',
        lang: 'bash',
        code: `curl -o screenshot.png \\\n  "${EXAMPLE_ORIGIN}/api/v1/screenshot?url=${ENCODED_TARGET}&device=mobile&colorScheme=dark"`,
      },
      {
        label: 'Use as an image',
        lang: 'html',
        code: `<img src="${EXAMPLE_ORIGIN}/api/v1/screenshot?url=${ENCODED_TARGET}&format=jpeg" alt="Screenshot of example.com" />`,
      },
    ],
  },
  {
    id: 'pdf',
    path: '/api/v1/pdf',
    title: 'PDF',
    returns: 'application/pdf',
    intro: ['Renders the page in a headless browser and returns it as a PDF document.'],
    params: [
      URL_PARAM,
      {
        name: 'format',
        type: '`A4` | `Letter`',
        fallback: 'A4',
        description: 'Paper size.',
      },
      {
        name: 'landscape',
        type: 'boolean',
        fallback: 'false',
        description: 'Landscape orientation instead of portrait.',
      },
      {
        name: 'printBackground',
        type: 'boolean',
        fallback: 'true',
        description: 'Include background colours and images.',
      },
      FORCE_PARAM,
      TTL_PARAM,
    ],
    notes: ['As with screenshots, errors are returned as JSON with the matching HTTP status.'],
    samples: [
      {
        label: 'Request',
        lang: 'bash',
        code: `curl -o page.pdf \\\n  "${EXAMPLE_ORIGIN}/api/v1/pdf?url=${ENCODED_TARGET}&format=Letter&landscape=true"`,
      },
    ],
  },
  {
    id: 'extract',
    path: '/api/v1/extract',
    title: 'Extract',
    returns: 'application/json',
    intro: [
      'Scrapes the fields you describe. `fields` is a URL-encoded JSON object that maps each output name to a rule; the response returns the same names with the extracted values.',
    ],
    params: [
      URL_PARAM,
      {
        name: 'fields',
        type: 'JSON object',
        required: true,
        description: 'Extraction rules, URL-encoded. One rule per output field; see the rule properties below.',
      },
      RENDER_PARAM,
      FORCE_PARAM,
      TTL_PARAM,
    ],
    samples: [
      {
        label: 'Rules',
        lang: 'json',
        code: json({
          price: { selector: '.price', attr: 'text', type: 'number' },
          links: { selector: 'a', attr: 'href', type: 'url', all: true },
        }),
      },
      {
        label: 'Request',
        lang: 'bash',
        code: `curl -G "${EXAMPLE_ORIGIN}/api/v1/extract" \\\n  --data-urlencode "url=${TARGET}" \\\n  --data-urlencode 'fields={"price":{"selector":".price","attr":"text","type":"number"},"links":{"selector":"a","attr":"href","type":"url","all":true}}'`,
      },
      {
        label: 'Response',
        lang: 'json',
        code: json({
          status: 'success',
          data: {
            url: TARGET,
            fields: {
              price: 49.9,
              links: ['https://example.com/', 'https://example.com/pricing'],
            },
          },
          meta: { cached: false, source: 'http', durationMs: 118 },
        }),
      },
    ],
  },
  {
    id: 'content',
    path: '/api/v1/content',
    title: 'Content',
    returns: 'application/json',
    intro: [
      'Returns the readable part of a page, without navigation, ads or boilerplate, as plain text and as Markdown. It is meant for AI agents, summarisers and search indexing.',
    ],
    params: [URL_PARAM, RENDER_PARAM, FORCE_PARAM, TTL_PARAM],
    samples: [
      { label: 'Request', lang: 'bash', code: `curl "${EXAMPLE_ORIGIN}/api/v1/content?url=${ENCODED_TARGET}"` },
      {
        label: 'Response',
        lang: 'json',
        code: json({
          status: 'success',
          data: {
            url: TARGET,
            title: 'Launching the new editor',
            lang: 'en',
            excerpt: 'What changed in the editor, and how to migrate your documents.',
            text: 'Launching the new editor\n\nToday we are releasing…',
            markdown: '# Launching the new editor\n\nToday we are releasing…',
            wordCount: 742,
            readingTimeMinutes: 4,
          },
          meta: { cached: false, source: 'http', durationMs: 164 },
        }),
      },
    ],
  },
];

/** Properties of one rule of the `fields` object of `/extract`. */
export const EXTRACT_RULE: readonly Param[] = [
  {
    name: 'selector',
    type: 'string',
    required: true,
    description: 'CSS selector of the element to read.',
  },
  {
    name: 'attr',
    type: 'string',
    fallback: 'text',
    description: '`text` for the element text, or the name of an attribute such as `href`, `src` or `content`.',
  },
  {
    name: 'type',
    type: 'string',
    fallback: 'string',
    description:
      'How the raw value is converted. `number` parses a numeric value out of the text; `url` resolves the value against the page URL into an absolute URL.',
  },
  {
    name: 'all',
    type: 'boolean',
    fallback: 'false',
    description: 'Return an array with every match instead of the first match only.',
  },
];

export interface ErrorRow {
  readonly code: string;
  readonly http: string;
  readonly status: 'fail' | 'error';
  readonly meaning: string;
}

export const ERRORS: readonly ErrorRow[] = [
  { code: 'EINVALIDPARAMS', http: '400', status: 'fail', meaning: 'A query parameter is missing, unknown or has an invalid value. Also returned with 404 for an unknown route.' },
  { code: 'EINVALIDURL', http: '400', status: 'fail', meaning: 'The `url` is malformed or does not use `http` or `https`.' },
  { code: 'EFORBIDDENURL', http: '403', status: 'fail', meaning: 'The destination is refused by the SSRF policy: private, loopback or metadata address, internal host name, or a port that is not allowed.' },
  { code: 'ERATELIMIT', http: '429', status: 'fail', meaning: 'Too many requests. Wait for the delay given in the message and the `retry-after` header.' },
  { code: 'EUNREACHABLE', http: '502', status: 'error', meaning: 'The target could not be reached: DNS failure, refused connection, TLS error.' },
  { code: 'ETARGETSTATUS', http: '502', status: 'error', meaning: 'The target answered with an HTTP error status.' },
  { code: 'EBUSY', http: '503', status: 'error', meaning: 'The rendering queue is full. Retry shortly.' },
  { code: 'ETIMEOUT', http: '504', status: 'error', meaning: 'The target did not answer in time.' },
  { code: 'EBROWSER', http: '500', status: 'error', meaning: 'The headless browser crashed or could not start.' },
  { code: 'EINTERNAL', http: '500', status: 'error', meaning: 'Unexpected server error. No internal detail is disclosed.' },
];

export const ERROR_SAMPLE = json({
  status: 'fail',
  code: 'EFORBIDDENURL',
  message: 'Destination is not allowed',
});

export const ENVELOPE_SAMPLE = json({
  status: 'success',
  data: { url: TARGET, title: 'Launching the new editor' },
  meta: { cached: true, source: 'http', durationMs: 3 },
});

export const QUICK_START = `curl "${EXAMPLE_ORIGIN}/api/v1/meta?url=${ENCODED_TARGET}"`;
export const AUTH_SAMPLE = `curl -H "x-api-key: $LINKFORGE_API_KEY" \\\n  "${EXAMPLE_ORIGIN}/api/v1/meta?url=${ENCODED_TARGET}"`;
export const HEALTH_SAMPLE = `curl "${EXAMPLE_ORIGIN}/health"`;
export const OPENAPI_SAMPLE = `curl "${EXAMPLE_ORIGIN}/api/v1/openapi.json"`;
