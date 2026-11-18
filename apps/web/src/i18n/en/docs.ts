/** English text: docs. Typed against the French module: a missing key does not compile. */
import type { docs as source } from '../fr/docs.ts';

export const docs: Record<keyof typeof source, string> = {
  'meta.title': 'API reference · Omnillink',
  'meta.description':
    'Complete reference of the Omnillink API: endpoints, parameters, example requests and responses, errors, authentication, rate limits and caching.',

  'title': 'API reference',
  'lead': 'Every endpoint is a `GET` request under `/api/v1`. The examples use the address of this instance.',
  'toc.label': 'On this page',
  'toc.basics': 'Basics',
  'toc.endpoints': 'Endpoints',
  'toc.reference': 'Reference',

  'th.param': 'Parameter',
  'th.property': 'Property',
  'th.field': 'Field',
  'th.header': 'Header',
  'th.type': 'Type',
  'th.default': 'Default',
  'th.description': 'Description',
  'th.code': 'Code',
  'th.http': 'HTTP',
  'th.meaning': 'Meaning',
  'required': 'required',
  'returns': 'Returns',
  'params': 'Query parameters',
  'sample.request': 'Request',
  'sample.response': 'Response',
  'sample.rules': 'Rules',
  'sample.image': 'In an image tag',
  'sample.embed': 'A field used as an image',

  'quickstart.title': 'Quick start',
  'quickstart.p1': 'Pass the address of the page in the `url` parameter, URL-encoded. No key is needed to get started.',
  'quickstart.p2': 'JSON responses share the same envelope. `/screenshot` and `/pdf` return the file itself.',

  'auth.title': 'Authentication',
  'auth.p1':
    'The API works without authentication. The optional `x-api-key` header identifies your application and raises its rate limit.',
  'auth.p2':
    'Keys are defined by the operator of the instance, with the `API_KEYS` variable. When the instance declares keys, an unknown key is rejected with the `EUNAUTHORIZED` code (HTTP 401): the request is not treated as anonymous. When it declares none, the header is ignored.',

  'limits.title': 'Rate limits',
  'limits.p1':
    'Without a key, requests are counted per IP address: 60 per minute by default. With a valid key they are counted per key: 600 per minute by default. The operator sets these values with `RATE_LIMIT_MAX`, `RATE_LIMIT_KEY_MAX` and `RATE_LIMIT_WINDOW_MS`.',
  'limits.p2':
    'Beyond the limit, the API answers with status 429 and the `ERATELIMIT` code. These headers let you see it coming:',
  'limits.h.limit': 'Number of requests allowed in the window.',
  'limits.h.remaining': 'Number of requests left in the current window.',
  'limits.h.reset': 'Seconds until the window resets.',
  'limits.h.retry': 'Present on a 429 response: seconds to wait before retrying.',
  'limits.p3': '`/health` is not rate limited.',

  'format.title': 'Response format',
  'format.p1':
    'A success returns `status: "success"`, the result in `data` and information about the processing in `meta`.',
  'format.cached': '`true` when the response comes from the cache.',
  'format.source': '`http` when a plain HTTP request was enough, `browser` when the page was rendered in Chromium.',
  'format.duration': 'Server-side processing time, in milliseconds.',
  'format.p2':
    'A failure returns `status: "fail"` when the request is at fault (4xx statuses) or `"error"` when the server or the target is at fault (5xx statuses), with a stable `code` and a readable `message`. The full list is in [Errors](#errors).',

  'cache.title': 'Caching',
  'cache.p1':
    'Every result is cached on the server, under a key that depends on the URL and the parameters. By default it stays there for one hour; the operator can change that duration, and the `ttl` parameter sets it for a given request.',
  'cache.p2': '`force=true` skips the cache read and processes the page again. The new result replaces the old one.',
  'cache.p3':
    'The `x-cache` header is `HIT` or `MISS`, and `meta.cached` repeats that in JSON responses. Responses also carry a `cache-control` header with `max-age` and `s-maxage`, so a browser or a CDN can reuse them.',
  'cache.p4': 'Identical requests received at the same time are grouped: the page is processed only once.',

  'render.title': 'Rendering',
  'render.p1':
    '`/meta`, `/extract` and `/content` first read the page with a plain HTTP request, which is fast and cheap. With `render=auto`, a headless browser only starts when that first pass gives a poor result, or when the page is an empty single-page-app shell.',
  'render.p2':
    '`render=never` guarantees a fast answer. `render=always` suits pages built entirely with JavaScript. `/screenshot` and `/pdf` always go through the browser.',
  'render.p3':
    'Default limits: 10 s for the HTTP request, 20 s for browser navigation, 5 redirects and 5 MB of response body. The operator can change them.',

  'p.url':
    'Absolute address of the page, `http` or `https`, URL-encoded. At most 2,048 characters, without credentials.',
  'p.render':
    '`auto` reads the page over HTTP and opens a browser only when the result is poor. `never` stays on HTTP. `always` renders the page in the browser every time. See [Rendering](#rendering).',
  'p.force': 'Skips the cache read and processes the page again. The new result is still stored.',
  'p.ttl':
    'How long the result is kept in the cache, in seconds, from 60 to 86,400. It also sets the duration announced in `cache-control`. Without this parameter the server default applies. See [Caching](#caching).',

  'meta.h': 'Metadata',
  'meta.intro1':
    'Returns the normalised metadata of a page, merged from Open Graph, Twitter Cards, JSON-LD, standard HTML tags and feeds. Use it to build link previews, enrich bookmarks or index pages.',
  'meta.intro2': 'A field the page does not provide is `null`, or an empty array for lists.',
  'meta.p.embed':
    'Dot path to a URL inside `data`, such as `image.url`, `logo.url`, `favicon` or `images.0.url`. Instead of JSON, the API answers with a redirect to that URL, so the request works directly in a `src` attribute. When the path is absent or `null`, the API answers `EEMBEDNOTFOUND` (404).',
  'meta.fields.title': 'Fields of `data`',
  'meta.f.url': 'Final address, after redirects.',
  'meta.f.canonicalUrl': 'Canonical address declared by the page.',
  'meta.f.title': 'Page title.',
  'meta.f.description': 'Description or summary.',
  'meta.f.author': 'Author.',
  'meta.f.publisher': 'Name of the site or publisher.',
  'meta.f.lang': 'Declared language, for example `en`.',
  'meta.f.date': 'Publication date, in ISO 8601 format.',
  'meta.f.image': 'Main image: `url`, `width`, `height`, `type`, `alt`.',
  'meta.f.images': 'Every image found, in the same format as `image`.',
  'meta.f.favicon': 'Address of the site icon.',
  'meta.f.logo': 'Best brand icon, as `url`: the logo declared in JSON-LD, otherwise the largest icon of the page.',
  'meta.f.video': 'Main video: `url`, `type`, `width`, `height`.',
  'meta.f.audio': 'Main audio track: `url`, `type`.',
  'meta.f.keywords': 'Declared keywords.',
  'meta.f.feeds': 'RSS or Atom feeds advertised by the page: `url`, `title`, `type`.',
  'meta.f.jsonLd': 'JSON-LD blocks of the page, with `@graph` flattened.',
  'meta.f.contentType': 'Content type returned by the target.',

  'screenshot.h': 'Screenshot',
  'screenshot.intro1':
    'Renders the page in a headless browser and returns the image itself, not JSON. The request address works directly in a `src` attribute.',
  'screenshot.note':
    'Errors are still returned as JSON, with the matching HTTP status. Check the status, or the `content-type` header, before treating the body as an image.',
  'screenshot.p.device':
    '`desktop` uses a 1280 × 800 viewport. `mobile` emulates a phone (Pixel 7 profile: touch screen, mobile user agent, high pixel density).',
  'screenshot.p.width': 'Viewport width in CSS pixels, from 320 to 2560. Overrides the `device` preset.',
  'screenshot.p.height': 'Viewport height in CSS pixels, from 240 to 2160. Overrides the `device` preset.',
  'screenshot.p.fullPage':
    'Captures the whole scrollable page instead of the viewport, up to 12,000 px high. Ignored with `selector`.',
  'screenshot.p.selector':
    'CSS selector: only the first matching element is captured. When it matches no visible element, the API answers `ESELECTORNOTFOUND` (404).',
  'screenshot.p.format': 'Format of the returned image.',
  'screenshot.p.quality': 'JPEG quality, from 1 to 100. No effect on PNG.',
  'screenshot.p.colorScheme': 'Value of `prefers-color-scheme` reported to the page. Without this parameter nothing is forced.',
  'screenshot.p.hide':
    'CSS selectors to hide before the capture, separated by commas, 20 at most. Handy for cookie banners: `hide=.cookie-banner,#newsletter`.',
  'screenshot.p.waitFor': 'Extra wait before the capture, in milliseconds, from 0 to 10,000.',

  'pdf.h': 'PDF',
  'pdf.intro1': 'Renders the page in a headless browser, with its print stylesheet, and returns it as a PDF document. The document has 100 pages at most; above the maximum size the API answers `ETOOLARGE` (422).',
  'pdf.note': 'As with screenshots, errors are returned as JSON with the matching HTTP status.',
  'pdf.p.format': 'Paper size.',
  'pdf.p.landscape': 'Landscape orientation instead of portrait.',
  'pdf.p.printBackground': 'Includes background colours and images.',

  'extract.h': 'Extract',
  'extract.intro1':
    'Extracts the fields you describe. `fields` is a URL-encoded JSON object that maps each field name to a rule. The response uses the same names with the extracted values.',
  'extract.p.fields': 'URL-encoded JSON object: one rule per output field, 20 fields at most. The properties of a rule are described below.',
  'extract.rule.title': 'Properties of a rule',
  'extract.r.selector': 'CSS selector of the element to read, 300 characters at most.',
  'extract.r.attr': '`text` for the text of the element, `html` for its HTML content, or the name of an attribute such as `href`, `src` or `content`.',
  'extract.r.type':
    'Conversion applied to the raw value: `string`, `number` (numeric value) or `url` (absolute address, resolved from the page address).',
  'extract.r.all': 'Returns an array of every match, 100 at most, instead of the first one only.',

  'content.h': 'Content',
  'content.intro1':
    'Returns the readable part of a page, without navigation, ads or boilerplate, as plain text and as Markdown. Made for AI agents, summarisation and indexing.',
  'content.fields.title': 'Fields of `data`',
  'content.f.url': 'Final address, after redirects.',
  'content.f.title': 'Title of the content.',
  'content.f.lang': 'Language declared by the page.',
  'content.f.excerpt': 'Short excerpt or description.',
  'content.f.text': 'Content as plain text.',
  'content.f.markdown': 'The same content as Markdown: headings, lists, links, code.',
  'content.f.wordCount': 'Number of words in the content.',
  'content.f.readingTimeMinutes': 'Estimated reading time in minutes, at 200 words per minute, rounded up.',

  'openapi.h': 'OpenAPI',
  'openapi.p1':
    'Returns the OpenAPI 3.1 description of the API, as JSON. Use it to generate a typed client or to import it into your API testing tool.',

  'health.h': 'Service status',
  'health.p1':
    'Returns the state of the instance: uptime, cache backend in use (`memory` or `redis`) and browser pool statistics. This endpoint is not rate limited.',

  'errors.title': 'Errors',
  'errors.p1':
    'Every error has the same shape on every endpoint, including those that return an image or a PDF. Rely on `code`, which is stable; `message` is meant for humans and may change.',

  'security.title': 'Security model',
  'security.p1':
    'An API that visits addresses supplied by its users is a classic target for SSRF attacks. Omnillink validates every destination before connecting to it.',
  'security.li1':
    'Only `http` and `https` are accepted, without credentials in the address, and on a list of allowed ports (80 and 443 by default).',
  'security.li2':
    '`localhost`, internal names and any address that is not publicly routable are refused: private ranges, loopback, link-local including `169.254.169.254`, CGNAT, IPv6 ULA, IPv4-mapped addresses. Unusual notations such as `0x7f.1` are normalised before the check.',
  'security.li3': 'A single private DNS record is enough to refuse a host name.',
  'security.li4': 'Over HTTP, the validated DNS resolution is pinned to the connection, and every redirect is validated again.',
  'security.li5':
    'In the browser, two layers. Every request the page makes is intercepted and validated; WebSockets and service workers are cut off. And the only network exit Chromium has is a proxy inside the API: on every connection, redirects included, that proxy applies the policy, resolves the name itself and connects to the address it has just validated.',
  'security.p2':
    'What is not covered: this proxy lives in the same process as the API. It does not replace egress filtering at network level (firewall, VPC), which remains recommended as defence in depth. The protection is about which destinations the browser can reach, not about what a page does once it is loaded. The [repository README](https://github.com/kayzen-lyon/linkforge#readme) has the details.',
  'extract.note':
    'A field is `null` when nothing matches or the value cannot be converted. Strings are cut at 10,000 characters.',
  'html.note':
    '`/meta`, `/extract` and `/content` need an HTML document: for an image, a PDF or any other file type, the API answers `ENOTHTML` (422).',
  'spec.note': 'The sections that follow, and the “More parameters” tables, are generated from the OpenAPI document of the API, in its own wording.',
  'params.more': 'More parameters (OpenAPI document)',
};
