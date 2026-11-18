/**
 * The API reference content, as data.
 *
 * `render.ts` turns this into static HTML at build time. Nothing here is
 * prose: every description is a key of the `docs` dictionary (src/i18n), so
 * the reference exists in both languages. Keep names, types and defaults in
 * sync with the API implementation (apps/api): users rely on this page.
 */
import type { common, docs } from '../i18n/fr.ts';
import type { Lang } from '../lib/highlight.ts';
import { SITE_ORIGIN } from '../site/config.ts';

export type DocsKey = keyof typeof docs;
export type CommonKey = keyof typeof common;

/** Origin used in the examples; the page swaps it for the real origin at runtime. */
export const EXAMPLE_ORIGIN = SITE_ORIGIN;
const TARGET = 'https://example.com/blog/launch';
const ENCODED_TARGET = encodeURIComponent(TARGET);

/** One row of a reference table: a query parameter, a rule property or a response field. */
export interface Row {
  readonly name: string;
  /** Rendered with the inline syntax, e.g. '`png` | `jpeg`'. Not translated. */
  readonly type: string;
  /** Default value. Omitted when there is none. */
  readonly fallback?: string;
  readonly required?: boolean;
  readonly description: DocsKey;
}

export interface Sample {
  readonly label: DocsKey;
  readonly lang: Lang;
  readonly code: string;
}

export interface FieldTable {
  readonly title: DocsKey;
  readonly nameHeader: DocsKey;
  /** Whether the table has a "default" column. */
  readonly defaults: boolean;
  readonly rows: readonly Row[];
}

export interface Endpoint {
  readonly id: string;
  readonly path: string;
  readonly title: DocsKey;
  readonly returns: string;
  readonly intro: readonly DocsKey[];
  readonly params: readonly Row[];
  /** Extra reference tables shown after the parameters. */
  readonly tables?: readonly FieldTable[];
  readonly notes?: readonly DocsKey[];
  readonly samples: readonly Sample[];
}

const URL_PARAM: Row = { name: 'url', type: '`string`', required: true, description: 'p.url' };
const RENDER_PARAM: Row = {
  name: 'render',
  type: '`auto` | `never` | `always`',
  fallback: '`auto`',
  description: 'p.render',
};
const FORCE_PARAM: Row = { name: 'force', type: '`boolean`', fallback: '`false`', description: 'p.force' };
const TTL_PARAM: Row = { name: 'ttl', type: '`integer`', description: 'p.ttl' };

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const EXAMPLE_IMAGE = {
  url: 'https://example.com/img/launch.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'The new editor',
};

const EXTRACT_RULES = {
  price: { selector: '.price', attr: 'text', type: 'number' },
  links: { selector: 'a', attr: 'href', type: 'url', all: true },
};

export const ENDPOINTS: readonly Endpoint[] = [
  {
    id: 'meta',
    path: '/api/v1/meta',
    title: 'meta.h',
    returns: '`application/json`',
    intro: ['meta.intro1', 'meta.intro2'],
    params: [
      URL_PARAM,
      RENDER_PARAM,
      FORCE_PARAM,
      TTL_PARAM,
      { name: 'embed', type: '`string`', description: 'meta.p.embed' },
    ],
    tables: [
      {
        title: 'meta.fields.title',
        nameHeader: 'th.field',
        defaults: false,
        rows: [
          { name: 'url', type: '`string`', description: 'meta.f.url' },
          { name: 'canonicalUrl', type: '`string` | `null`', description: 'meta.f.canonicalUrl' },
          { name: 'title', type: '`string` | `null`', description: 'meta.f.title' },
          { name: 'description', type: '`string` | `null`', description: 'meta.f.description' },
          { name: 'author', type: '`string` | `null`', description: 'meta.f.author' },
          { name: 'publisher', type: '`string` | `null`', description: 'meta.f.publisher' },
          { name: 'lang', type: '`string` | `null`', description: 'meta.f.lang' },
          { name: 'date', type: '`string` | `null`', description: 'meta.f.date' },
          { name: 'image', type: '`object` | `null`', description: 'meta.f.image' },
          { name: 'images', type: '`object[]`', description: 'meta.f.images' },
          { name: 'favicon', type: '`string` | `null`', description: 'meta.f.favicon' },
          { name: 'logo', type: '`object` | `null`', description: 'meta.f.logo' },
          { name: 'video', type: '`object` | `null`', description: 'meta.f.video' },
          { name: 'audio', type: '`object` | `null`', description: 'meta.f.audio' },
          { name: 'keywords', type: '`string[]`', description: 'meta.f.keywords' },
          { name: 'feeds', type: '`object[]`', description: 'meta.f.feeds' },
          { name: 'jsonLd', type: '`object[]`', description: 'meta.f.jsonLd' },
          { name: 'contentType', type: '`string` | `null`', description: 'meta.f.contentType' },
        ],
      },
    ],
    samples: [
      {
        label: 'sample.request',
        lang: 'bash',
        code: `curl "${EXAMPLE_ORIGIN}/api/v1/meta?url=${ENCODED_TARGET}"`,
      },
      {
        label: 'sample.response',
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
            image: EXAMPLE_IMAGE,
            images: [EXAMPLE_IMAGE],
            favicon: 'https://example.com/favicon.ico',
            logo: { url: 'https://example.com/logo.png' },
            video: null,
            audio: null,
            keywords: ['editor', 'release'],
            feeds: [{ url: 'https://example.com/feed.xml', title: 'Example Blog', type: 'application/rss+xml' }],
            jsonLd: [{ '@type': 'BlogPosting', headline: 'Launching the new editor' }],
            contentType: 'text/html',
          },
          meta: { cached: false, source: 'http', durationMs: 132 },
        }),
      },
      {
        label: 'sample.embed',
        lang: 'html',
        code: `<img src="${EXAMPLE_ORIGIN}/api/v1/meta?url=${ENCODED_TARGET}&embed=image.url" alt="" />`,
      },
    ],
  },
  {
    id: 'screenshot',
    path: '/api/v1/screenshot',
    title: 'screenshot.h',
    returns: '`image/png` | `image/jpeg`',
    intro: ['screenshot.intro1'],
    params: [
      URL_PARAM,
      {
        name: 'device',
        type: '`desktop` | `mobile`',
        fallback: '`desktop`',
        description: 'screenshot.p.device',
      },
      { name: 'width', type: '`integer`', description: 'screenshot.p.width' },
      { name: 'height', type: '`integer`', description: 'screenshot.p.height' },
      { name: 'fullPage', type: '`boolean`', fallback: '`false`', description: 'screenshot.p.fullPage' },
      { name: 'selector', type: '`string`', description: 'screenshot.p.selector' },
      { name: 'format', type: '`png` | `jpeg`', fallback: '`png`', description: 'screenshot.p.format' },
      { name: 'quality', type: '`integer`', fallback: '`80`', description: 'screenshot.p.quality' },
      {
        name: 'colorScheme',
        type: '`light` | `dark`',
        description: 'screenshot.p.colorScheme',
      },
      { name: 'hide', type: '`string`', description: 'screenshot.p.hide' },
      { name: 'waitFor', type: '`integer`', fallback: '`0`', description: 'screenshot.p.waitFor' },
      FORCE_PARAM,
      TTL_PARAM,
    ],
    notes: ['screenshot.note'],
    samples: [
      {
        label: 'sample.request',
        lang: 'bash',
        code: `curl -o screenshot.png \\\n  "${EXAMPLE_ORIGIN}/api/v1/screenshot?url=${ENCODED_TARGET}&device=mobile&colorScheme=dark"`,
      },
      {
        label: 'sample.image',
        lang: 'html',
        code: `<img src="${EXAMPLE_ORIGIN}/api/v1/screenshot?url=${ENCODED_TARGET}&format=jpeg" alt="example.com" />`,
      },
    ],
  },
  {
    id: 'pdf',
    path: '/api/v1/pdf',
    title: 'pdf.h',
    returns: '`application/pdf`',
    intro: ['pdf.intro1'],
    params: [
      URL_PARAM,
      { name: 'format', type: '`A4` | `Letter`', fallback: '`A4`', description: 'pdf.p.format' },
      { name: 'landscape', type: '`boolean`', fallback: '`false`', description: 'pdf.p.landscape' },
      {
        name: 'printBackground',
        type: '`boolean`',
        fallback: '`true`',
        description: 'pdf.p.printBackground',
      },
      FORCE_PARAM,
      TTL_PARAM,
    ],
    notes: ['pdf.note'],
    samples: [
      {
        label: 'sample.request',
        lang: 'bash',
        code: `curl -o page.pdf \\\n  "${EXAMPLE_ORIGIN}/api/v1/pdf?url=${ENCODED_TARGET}&format=Letter&landscape=true"`,
      },
    ],
  },
  {
    id: 'extract',
    path: '/api/v1/extract',
    title: 'extract.h',
    returns: '`application/json`',
    intro: ['extract.intro1'],
    params: [
      URL_PARAM,
      { name: 'fields', type: '`string` (JSON)', required: true, description: 'extract.p.fields' },
      RENDER_PARAM,
      FORCE_PARAM,
      TTL_PARAM,
    ],
    tables: [
      {
        title: 'extract.rule.title',
        nameHeader: 'th.property',
        defaults: true,
        rows: [
          { name: 'selector', type: '`string`', required: true, description: 'extract.r.selector' },
          { name: 'attr', type: '`string`', fallback: '`text`', description: 'extract.r.attr' },
          { name: 'type', type: '`string`', fallback: '`string`', description: 'extract.r.type' },
          { name: 'all', type: '`boolean`', fallback: '`false`', description: 'extract.r.all' },
        ],
      },
    ],
    notes: ['extract.note', 'html.note'],
    samples: [
      { label: 'sample.rules', lang: 'json', code: json(EXTRACT_RULES) },
      {
        label: 'sample.request',
        lang: 'bash',
        code: `curl -G "${EXAMPLE_ORIGIN}/api/v1/extract" \\\n  --data-urlencode "url=${TARGET}" \\\n  --data-urlencode 'fields=${JSON.stringify(EXTRACT_RULES)}'`,
      },
      {
        label: 'sample.response',
        lang: 'json',
        code: json({
          status: 'success',
          data: {
            url: TARGET,
            fields: { price: 49.9, links: ['https://example.com/', 'https://example.com/pricing'] },
          },
          meta: { cached: false, source: 'http', durationMs: 118 },
        }),
      },
    ],
  },
  {
    id: 'content',
    path: '/api/v1/content',
    title: 'content.h',
    returns: '`application/json`',
    intro: ['content.intro1'],
    params: [URL_PARAM, RENDER_PARAM, FORCE_PARAM, TTL_PARAM],
    tables: [
      {
        title: 'content.fields.title',
        nameHeader: 'th.field',
        defaults: false,
        rows: [
          { name: 'url', type: '`string`', description: 'content.f.url' },
          { name: 'title', type: '`string` | `null`', description: 'content.f.title' },
          { name: 'lang', type: '`string` | `null`', description: 'content.f.lang' },
          { name: 'excerpt', type: '`string` | `null`', description: 'content.f.excerpt' },
          { name: 'text', type: '`string`', description: 'content.f.text' },
          { name: 'markdown', type: '`string`', description: 'content.f.markdown' },
          { name: 'wordCount', type: '`integer`', description: 'content.f.wordCount' },
          { name: 'readingTimeMinutes', type: '`integer`', description: 'content.f.readingTimeMinutes' },
        ],
      },
    ],
    samples: [
      {
        label: 'sample.request',
        lang: 'bash',
        code: `curl "${EXAMPLE_ORIGIN}/api/v1/content?url=${ENCODED_TARGET}"`,
      },
      {
        label: 'sample.response',
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

export interface ErrorRow {
  readonly code: string;
  readonly http: string;
  readonly meaning: CommonKey;
}

/** Ordered by HTTP status. `status` is "fail" below 500 and "error" from 500. */
export const ERRORS: readonly ErrorRow[] = [
  { code: 'EINVALIDPARAMS', http: '400', meaning: 'err.EINVALIDPARAMS' },
  { code: 'EINVALIDURL', http: '400', meaning: 'err.EINVALIDURL' },
  { code: 'EUNAUTHORIZED', http: '401', meaning: 'err.EUNAUTHORIZED' },
  { code: 'EFORBIDDENURL', http: '403', meaning: 'err.EFORBIDDENURL' },
  { code: 'EEMBEDNOTFOUND', http: '404', meaning: 'err.EEMBEDNOTFOUND' },
  { code: 'ESELECTORNOTFOUND', http: '404', meaning: 'err.ESELECTORNOTFOUND' },
  { code: 'ENOTHTML', http: '422', meaning: 'err.ENOTHTML' },
  { code: 'ETOOLARGE', http: '422', meaning: 'err.ETOOLARGE' },
  { code: 'ERATELIMIT', http: '429', meaning: 'err.ERATELIMIT' },
  { code: 'EBROWSER', http: '500', meaning: 'err.EBROWSER' },
  { code: 'EINTERNAL', http: '500', meaning: 'err.EINTERNAL' },
  { code: 'EUNREACHABLE', http: '502', meaning: 'err.EUNREACHABLE' },
  { code: 'ETARGETSTATUS', http: '502', meaning: 'err.ETARGETSTATUS' },
  { code: 'EBUSY', http: '503', meaning: 'err.EBUSY' },
  { code: 'ETIMEOUT', http: '504', meaning: 'err.ETIMEOUT' },
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

export const HEALTH_RESPONSE = json({
  status: 'ok',
  uptimeSeconds: 5121,
  cache: 'memory',
  browserPool: { active: 0, queued: 0, maxConcurrency: 4, browserConnected: true },
});

export const QUICK_START = `curl "${EXAMPLE_ORIGIN}/api/v1/meta?url=${ENCODED_TARGET}"`;
export const AUTH_SAMPLE = `curl -H "x-api-key: $OMNILLINK_API_KEY" \\\n  "${EXAMPLE_ORIGIN}/api/v1/meta?url=${ENCODED_TARGET}"`;
export const HEALTH_SAMPLE = `curl "${EXAMPLE_ORIGIN}/health"`;
export const OPENAPI_SAMPLE = `curl "${EXAMPLE_ORIGIN}/api/v1/openapi.json"`;
