/**
 * English dictionary. Typed against the French one: a missing or extra key
 * does not compile. Same inline syntax: `code`, **strong**, [label](href).
 */
import type * as fr from './fr';

type Like<T> = Record<keyof T, string>;

export const common: Like<typeof fr.common> = {
  'skip': 'Skip to content',
  'brand.home': 'LinkForge home',
  'nav.label': 'Main navigation',
  'nav.demo': 'Demo',
  'nav.features': 'Features',
  'nav.examples': 'Examples',
  'nav.selfHost': 'Self-hosting',
  'nav.docs': 'API reference',
  'nav.menu': 'Menu',
  'lang.label': 'Language',
  'lang.fr': 'French',
  'lang.en': 'English',
  'theme.toLight': 'Switch to the light theme',
  'theme.toDark': 'Switch to the dark theme',
  'copy': 'Copy',
  'copied': 'Copied',
  'copyFailed': 'Copy failed',
  'footer.tagline':
    'An open-source API that turns a URL into metadata, screenshots, PDFs, custom fields and readable content. Released under the MIT licence.',
  'footer.label': 'Footer',
  'footer.product': 'Product',
  'footer.developers': 'Developers',
  'footer.demo': 'Live demo',
  'footer.features': 'Features',
  'footer.examples': 'Code examples',
  'footer.selfHost': 'Self-hosting',
  'footer.docs': 'API reference',
  'footer.openapi': 'OpenAPI document',
  'footer.health': 'Service status',
  'footer.source': 'Source on GitHub',

  'err.EINVALIDPARAMS':
    'A query parameter is missing, unknown or invalid. This code also comes with the 404 status of an unknown route.',
  'err.EINVALIDURL': 'The `url` is malformed or uses neither `http` nor `https`.',
  'err.EUNAUTHORIZED': 'The key sent in `x-api-key` is unknown.',
  'err.EFORBIDDENURL':
    'The destination is refused by the SSRF policy: private, loopback or metadata address, internal host name, or a port that is not allowed.',
  'err.EEMBEDNOTFOUND': 'The path requested with `embed` is absent from the `/meta` response, or is `null`.',
  'err.ESELECTORNOTFOUND': 'The `selector` given to `/screenshot` matches no visible element.',
  'err.ENOTHTML': 'The target is not an HTML document, and this endpoint needs one.',
  'err.ETOOLARGE': 'The generated output exceeds the maximum allowed size.',
  'err.ERATELIMIT': 'Too many requests. Wait for the delay given in the message and in the `retry-after` header.',
  'err.EUNREACHABLE': 'The target cannot be reached: DNS failure, refused connection, TLS error.',
  'err.ETARGETSTATUS': 'The target answered with an HTTP error status.',
  'err.EBUSY': 'The rendering queue is full. Retry in a moment.',
  'err.ETIMEOUT': 'The target did not answer in time.',
  'err.EBROWSER': 'The headless browser crashed or could not start.',
  'err.EINTERNAL': 'Unexpected server error. No internal detail is disclosed.',
};

export const home: Like<typeof fr.home> = {
  'meta.title': 'LinkForge · Open-source link intelligence API',
  'meta.description':
    'LinkForge is an open-source API that turns a URL into metadata, screenshots, PDFs, extracted fields and readable content. Try it live.',

  'hero.eyebrow': 'Open-source API · MIT licence',
  'hero.title': 'One URL in. Metadata, screenshot, PDF and content out.',
  'hero.lead':
    'LinkForge is a REST API that reads a web page for you: normalised metadata, screenshots, PDF export, custom extraction and readable text for your AI agents. The code is open, so you can host it wherever you like.',
  'hero.cta.demo': 'Try the live demo',
  'hero.cta.docs': 'Read the API reference',
  'manifest.title': 'Five endpoints, one required parameter',
  'manifest.meta': 'Title, description, image, author, date, JSON-LD, feeds',
  'manifest.screenshot': 'PNG or JPEG, desktop or mobile, full page or a single element',
  'manifest.pdf': 'A4 or Letter document, portrait or landscape',
  'manifest.extract': 'Your own fields, described with CSS selectors',
  'manifest.content': 'Readable text and Markdown, without navigation or ads',

  'demo.title': 'Try it on a real page',
  'demo.lead': 'Enter a public URL. Each tab calls the matching endpoint of this instance.',
  'demo.url.label': 'URL to inspect',
  'demo.run': 'Run',
  'demo.tabs.label': 'Endpoint',
  'demo.tab.meta': 'Metadata',
  'demo.tab.screenshot': 'Screenshot',
  'demo.tab.pdf': 'PDF',
  'demo.tab.extract': 'Extract',
  'demo.tab.content': 'Content',
  'demo.request.label': 'Request',
  'demo.idle': 'Run the request to see the response.',
  'demo.loading.meta': 'Reading the page…',
  'demo.loading.screenshot': 'Rendering the page in the browser…',
  'demo.loading.extract': 'Extracting the fields…',
  'demo.loading.content': 'Extracting the readable content…',
  'demo.error.title': 'The request failed',
  'demo.error.network': 'The API could not be reached. Check that it is running, then try again.',
  'demo.error.unexpected': 'The API returned an unexpected response (HTTP {status}).',
  'demo.error.invalidUrl': 'Enter a full URL that starts with http:// or https://.',
  'demo.error.apiMessage': 'API message:',
  'demo.badge.http': 'HTTP request',
  'demo.badge.browser': 'browser render',
  'demo.badge.cached': 'from cache',
  'demo.badge.duration': '{ms} ms',

  'demo.meta.preview': 'Link preview',
  'demo.meta.json': 'JSON response',
  'demo.meta.untitled': 'Untitled',
  'demo.meta.author': 'Author',
  'demo.meta.publisher': 'Publisher',
  'demo.meta.date': 'Date',
  'demo.meta.lang': 'Language',

  'demo.shot.device': 'Device',
  'demo.shot.desktop': 'Desktop',
  'demo.shot.mobile': 'Mobile',
  'demo.shot.fullPage': 'Full page',
  'demo.shot.dark': 'Dark scheme',
  'demo.shot.alt': 'Screenshot of {host}',
  'demo.shot.open': 'Open the image',

  'demo.pdf.format': 'Format',
  'demo.pdf.landscape': 'Landscape',
  'demo.pdf.background': 'Backgrounds',
  'demo.pdf.open': 'Open the PDF',
  'demo.pdf.download': 'Download',
  'demo.pdf.note': 'The PDF is generated on demand, when you open the link.',

  'demo.extract.rules': 'Extraction rules (JSON)',
  'demo.extract.hint': 'One key per field. Each rule accepts `selector`, `attr`, `type` and `all`.',
  'demo.extract.invalid': 'The rules must be a valid JSON object. {detail}',
  'demo.extract.result': 'Extracted fields',

  'demo.content.view': 'View',
  'demo.content.rendered': 'Rendered',
  'demo.content.markdown': 'Markdown',
  'demo.content.text': 'Text',
  'demo.content.stats': '{words} words · {minutes} min read',
  'demo.content.empty': 'No readable content was found on this page.',

  'features.title': 'What the API takes care of',
  'features.lead': 'Reading an unknown page takes more than one request. Here is what LinkForge does on every call.',
  'features.pipeline.title': 'HTTP first, a browser only when needed',
  'features.pipeline.body':
    'The page is first read with a plain HTTP request. Chromium only starts when the result is poor or the page is an empty app shell. The `meta.source` field tells you which path was taken.',
  'features.pipeline.step1': 'Cache lookup',
  'features.pipeline.step2': 'HTTP request',
  'features.pipeline.step3': 'Extraction',
  'features.pipeline.step4': 'Chromium render, if needed',
  'features.pipeline.step5': 'Cache write',
  'features.ssrf.title': 'Strict SSRF protection',
  'features.ssrf.body':
    'Private, loopback and cloud metadata addresses are refused. DNS resolution is pinned to the connection, and every redirect and every browser sub-request is validated again.',
  'features.cache.title': 'Caching and de-duplication',
  'features.cache.body':
    'Results are cached, in memory or in Redis. Identical requests that arrive at the same time trigger a single run.',
  'features.embed.title': 'One field, straight into a tag',
  'features.embed.body':
    'With `embed=image.url` the API redirects to the page image, so the request itself works as the source of an `img` tag.',
  'features.extract.title': 'Custom extraction',
  'features.extract.body':
    'Describe your fields with a CSS selector, an attribute and a type. The API returns JSON in the shape you chose.',
  'features.content.title': 'Content ready for AI agents',
  'features.content.body':
    'The main text of the page, as Markdown and as plain text, with the word count and the reading time.',
  'features.openapi.title': 'OpenAPI 3.1 contract',
  'features.openapi.body':
    'The `/api/v1/openapi.json` document describes every endpoint. Generate a client or import it into your tools.',
  'features.errors.title': 'Stable errors',
  'features.errors.body':
    'Every failure carries a stable code, from `EINVALIDURL` to `ETIMEOUT`, and the matching HTTP status.',

  'examples.title': 'One request is enough to integrate it',
  'examples.lead': 'The examples follow the URL and the tab selected in the demo.',
  'examples.endpoint': 'Endpoint',
  'examples.language': 'Language',
  'examples.more': 'Every parameter is described in the [API reference](/docs).',

  'selfHost.title': 'Host it yourself',
  'selfHost.lead': 'LinkForge is released under the MIT licence. You need Node.js 22 or newer; Redis is optional.',
  'selfHost.step1': 'Get the code',
  'selfHost.step2': 'Install the dependencies and Chromium',
  'selfHost.step3': 'Create your configuration',
  'selfHost.step4': 'Start the API',
  'selfHost.listening': 'The API then listens on `http://localhost:3000`.',
  'selfHost.fact1.title': 'One function is enough',
  'selfHost.fact1.body':
    'A single serverless function can serve both the API and this site. The Vercel configuration ships with the repository.',
  'selfHost.fact2.title': 'Redis when you need it',
  'selfHost.fact2.body': 'Without Redis the cache lives in memory, per instance. Add `REDIS_URL` to share it.',
  'selfHost.fact3.title': 'Everything is set through the environment',
  'selfHost.fact3.body':
    'Cache durations, timeouts, browser concurrency, rate limit, allowed ports: every setting is an environment variable.',
  'selfHost.cta': 'View the repository on GitHub',
};

export const docs: Like<typeof fr.docs> = {
  'meta.title': 'API reference · LinkForge',
  'meta.description':
    'Complete reference of the LinkForge API: endpoints, parameters, example requests and responses, errors, authentication, rate limits and caching.',

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
    'Keys are defined by the operator of the instance. An unknown key is rejected with the `EUNAUTHORIZED` code (HTTP 401): the request is not treated as an anonymous one.',

  'limits.title': 'Rate limits',
  'limits.p1':
    'Without a key, requests are counted per IP address. By default an instance accepts 60 requests per minute; the operator can change that value. With a valid key the limit is higher and counted per key.',
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
  'p.force': 'Skips the cache read and processes the page again.',
  'p.ttl':
    'How long the result is kept in the cache. Without this parameter the server default applies. See [Caching](#caching).',

  'meta.h': 'Metadata',
  'meta.intro1':
    'Returns the normalised metadata of a page, merged from Open Graph, Twitter Cards, JSON-LD, standard HTML tags and feeds. Use it to build link previews, enrich bookmarks or index pages.',
  'meta.intro2': 'A field the page does not provide is `null`, or an empty array for lists.',
  'meta.p.embed':
    'Dot path to a URL inside `data`, such as `image.url`, `logo.url` or `favicon`. Instead of JSON, the API answers with a redirect to that URL, so the request works directly in a `src` attribute. When the path is absent or `null`, the API answers `EEMBEDNOTFOUND` (404).',
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
  'meta.f.logo': 'Publisher logo: `url`.',
  'meta.f.video': 'Main video: `url`, `type`, `width`, `height`.',
  'meta.f.audio': 'Main audio track: `url`, `type`.',
  'meta.f.keywords': 'Declared keywords.',
  'meta.f.feeds': 'RSS or Atom feeds advertised by the page.',
  'meta.f.jsonLd': 'JSON-LD blocks of the page, with `@graph` flattened.',
  'meta.f.contentType': 'Content type returned by the target.',

  'screenshot.h': 'Screenshot',
  'screenshot.intro1':
    'Renders the page in a headless browser and returns the image itself, not JSON. The request address works directly in a `src` attribute.',
  'screenshot.note':
    'Errors are still returned as JSON, with the matching HTTP status. Check the status, or the `content-type` header, before treating the body as an image.',
  'screenshot.p.device':
    '`desktop` uses a 1280 × 800 viewport. `mobile` emulates a phone (Pixel 7 profile: touch screen, mobile user agent, high pixel density).',
  'screenshot.p.width': 'Viewport width in pixels. Overrides the `device` preset.',
  'screenshot.p.height': 'Viewport height in pixels. Overrides the `device` preset.',
  'screenshot.p.fullPage':
    'Captures the whole scrollable page instead of the viewport. Very tall pages are capped at 12,000 px.',
  'screenshot.p.selector':
    'CSS selector of one element to capture instead of the page. When it matches no visible element, the API answers `ESELECTORNOTFOUND` (404).',
  'screenshot.p.format': 'Format of the returned image.',
  'screenshot.p.quality': 'JPEG quality, from 1 to 100. No effect on PNG.',
  'screenshot.p.colorScheme': 'Value of `prefers-color-scheme` reported to the page.',
  'screenshot.p.hide':
    'CSS selectors to hide before the capture, separated by commas. Handy for cookie banners: `hide=.cookie-banner,#newsletter`.',
  'screenshot.p.waitFor': 'Extra wait after the page has loaded, in milliseconds, for animations or late content.',

  'pdf.h': 'PDF',
  'pdf.intro1': 'Renders the page in a headless browser and returns it as a PDF document.',
  'pdf.note': 'As with screenshots, errors are returned as JSON with the matching HTTP status.',
  'pdf.p.format': 'Paper size.',
  'pdf.p.landscape': 'Landscape orientation instead of portrait.',
  'pdf.p.printBackground': 'Includes background colours and images.',

  'extract.h': 'Extract',
  'extract.intro1':
    'Extracts the fields you describe. `fields` is a URL-encoded JSON object that maps each field name to a rule. The response uses the same names with the extracted values.',
  'extract.p.fields': 'Extraction rules, one per output field. The properties of a rule are described below.',
  'extract.rule.title': 'Properties of a rule',
  'extract.r.selector': 'CSS selector of the element to read.',
  'extract.r.attr': '`text` for the text of the element, or the name of an attribute such as `href`, `src` or `content`.',
  'extract.r.type':
    'Conversion applied to the raw value. `number` parses a numeric value out of it; `url` resolves it into an absolute address based on the page address.',
  'extract.r.all': 'Returns an array of every match instead of the first one only.',

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
  'content.f.readingTimeMinutes': 'Estimated reading time, in minutes.',

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
    'An API that visits addresses supplied by its users is a classic target for SSRF attacks. LinkForge validates every destination before connecting to it.',
  'security.li1':
    'Only `http` and `https` are accepted, without credentials in the address, and on a list of allowed ports (80 and 443 by default).',
  'security.li2':
    '`localhost`, internal names and any address that is not publicly routable are refused: private ranges, loopback, link-local including `169.254.169.254`, CGNAT, IPv6 ULA, IPv4-mapped addresses. Unusual notations such as `0x7f.1` are normalised before the check.',
  'security.li3': 'A single private DNS record is enough to refuse a host name.',
  'security.li4': 'Over HTTP, the validated DNS resolution is pinned to the connection, and every redirect is validated again.',
  'security.li5':
    'In the browser, every request is intercepted and validated, including sub-resources, redirects and iframes. WebSockets and service workers are cut off.',
  'security.p2':
    'Known limit: in the browser, Chromium performs its own DNS resolution after this check. The [repository README](https://github.com/kayzen-lyon/linkforge#readme) describes the status of this point.',
};
