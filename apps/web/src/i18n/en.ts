/**
 * English dictionary. Typed against the French one: a missing or extra key
 * does not compile. Same inline syntax: `code`, **strong**, [label](href).
 */
import type * as fr from './fr';

type Like<T> = Record<keyof T, string>;

export const common: Like<typeof fr.common> = {
  'skip': 'Skip to content',
  'brand.home': 'Omnillink home',
  'nav.label': 'Main navigation',
  'nav.demo': 'Demo',
  'nav.features': 'Features',
  'nav.examples': 'Examples',
  'nav.selfHost': 'Self-hosting',
  'nav.docs': 'API reference',
  'nav.menu': 'Navigation menu',
  'lang.label': 'Language',
  'copy': 'Copy',
  'copied': 'Copied',
  'copyFailed': 'Copy failed',
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
  'banner.label': 'Open-source project',
  'banner.text': 'Open source, under the MIT licence. Host your own instance.',
  'banner.short': 'Open source, MIT licence',
  'banner.link': 'View on GitHub',
  'nav.cta': 'Try the demo',
  'menu.label': 'Mobile menu',
  'menu.eyebrow': 'Navigation',
  'theme.dark': 'Dark theme',
  'newTab': '(new tab)',
  'top': 'Back to the top of the page',
  'crumb.label': 'Breadcrumb',
  'crumb.home': 'Home',
  'a11y.toggle': 'Accessibility options',
  'a11y.title': 'Accessibility',
  'a11y.size': 'Text size',
  'a11y.size.down': 'Decrease the text size',
  'a11y.size.up': 'Increase the text size',
  'a11y.size.0': 'Normal',
  'a11y.size.1': 'Large',
  'a11y.size.2': 'Very large',
  'a11y.contrast': 'Higher contrast',
  'a11y.font': 'Legible font',
  'a11y.oled': 'Pure black (OLED)',
  'a11y.oled.hint': 'Available in the dark theme',
  'a11y.reset': 'Reset the options',
  'footer.tagline':
    'An open-source API that turns a URL into metadata, screenshots, PDFs, custom fields and readable content.',
  'footer.chip': 'Free software, MIT licence',
  'footer.info': 'Information',
  'footer.faq': 'Frequently asked questions',
  'footer.accessibility': 'Accessibility',
  'footer.legal': 'Legal notice and privacy',
  'footer.notrack': 'This site sets no cookies and uses no trackers.',
  'footer.license': 'Omnillink is free software released under the MIT licence.',
  'footer.credit': 'Site made by [KAYZEN](https://www.kayzen-lyon.com)',
  'og.alt': 'Omnillink: one URL in, metadata, a screenshot, a PDF and content out.',
};

export const home: Like<typeof fr.home> = {
  'meta.title': 'Omnillink · The API for universal web transformation',
  'meta.description':
    'Omnillink is an open-source API that turns a URL into metadata, screenshots, PDFs, extracted fields and readable content. Try it live.',

  'hero.eyebrow': 'The API for universal web transformation',
  'hero.lead':
    'Omnillink is a REST API that reads a web page for you: normalised metadata, screenshots, PDF export, custom extraction and readable text for your AI agents. The code is open, so you can host it wherever you like.',
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
  'features.lead': 'Reading an unknown page takes more than one request. Here is what Omnillink does on every call.',
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
  'selfHost.lead': 'Omnillink is released under the MIT licence. You need Node.js 22 or newer; Redis is optional.',
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
  'hero.title.a': 'One URL in.',
  'hero.title.b': 'Metadata, screenshot, PDF and content out.',
  'hero.chip.mit': 'MIT licence',
  'hero.chip.selfHost': 'Self-hostable',
  'hero.chip.ssrf': 'SSRF protection',
  'hero.chip.openapi': 'OpenAPI 3.1',
  'hero.cta.github': 'View the code on GitHub',
  'demo.eyebrow': 'Live demo',
  'usecases.eyebrow': 'Use cases',
  'usecases.title': 'Who it is for, and what for',
  'usecases.lead': 'Omnillink is for teams that work with links: consumer products, internal tools, AI agents.',
  'usecases.1.title': 'Link previews',
  'usecases.1.body':
    'Chat, CMS, bookmark manager: show the title, image and description as soon as a link is pasted.',
  'usecases.2.title': 'AI agents and RAG',
  'usecases.2.body': 'Give a model the text of a page as Markdown, without menus or ads, instead of raw HTML.',
  'usecases.3.title': 'Screenshots and archiving',
  'usecases.3.body': 'Generate thumbnails, share images or a PDF copy of a page as it looks today.',
  'usecases.4.title': 'Monitoring and collection',
  'usecases.4.body':
    'Track a price, a stock level or a list of links with a few CSS selectors, without writing or maintaining a scraper.',
  'how.eyebrow': 'How it works',
  'how.title': 'How it works',
  'how.lead': 'Three steps, a single request on your side.',
  'how.step': 'Step {n}',
  'how.1.title': 'You send a URL',
  'how.1.body': 'A `GET` request with the address of the page and, if needed, a few options. No key is required to get started.',
  'how.2.title': 'Omnillink reads the page safely',
  'how.2.body':
    'The address is validated against SSRF attacks, then the page is read over HTTP. Chromium only takes over when the page needs it.',
  'how.3.title': 'You get a ready-to-use result',
  'how.3.body': 'Normalised JSON, an image or a PDF. The result is cached for the next calls.',
  'features.eyebrow': 'Features',
  'examples.eyebrow': 'Integration',
  'selfHost.eyebrow': 'Open source',
  'faq.eyebrow': 'FAQ',
  'faq.title': 'Frequently asked questions',
  'faq.1.q': 'Is Omnillink free?',
  'faq.1.a':
    'The software is free and released under the MIT licence: you can use it, change it and host it yourself. The instance that serves this site is a demonstration, with a rate limit.',
  'faq.2.q': 'Do I need an API key?',
  'faq.2.a':
    'No. The API answers without authentication. The optional `x-api-key` header raises the rate limit; keys are defined by the operator of each instance.',
  'faq.3.q': 'Which pages can Omnillink read?',
  'faq.3.a':
    'Public pages over `http` or `https`. Private, local or internal addresses are refused by the SSRF protection. Pages built with JavaScript are rendered in Chromium when needed.',
  'faq.4.q': 'Are the results up to date?',
  'faq.4.a':
    'Every result is cached, for one hour by default. The `ttl` parameter changes that duration for a request, and `force=true` reads the page again immediately.',
  'faq.5.q': 'Can I use a screenshot directly in an image tag?',
  'faq.5.a':
    'Yes. `/screenshot` returns the image itself, so its address works in a `src` attribute. With `embed`, `/meta` redirects to the image or icon of a page in the same way.',
  'faq.6.q': 'What do I need to host it?',
  'faq.6.a':
    'Node.js 22 or newer, and Chromium, installed by Playwright. Redis is optional. The configuration for a serverless deployment on Vercel ships with the repository.',
  'faq.7.q': 'Does this site track me?',
  'faq.7.a':
    'No. It sets no cookies and loads no analytics tool. Your theme, language and accessibility preferences stay in your browser. The details are in the [legal notice](/legal).',
  'cta.title': 'Try Omnillink on your own links',
  'cta.lead': 'The demo runs on this instance. The code is on GitHub if you would rather host it yourself.',
};

export const docs: Like<typeof fr.docs> = {
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
    'In the browser, every request is intercepted and validated, including sub-resources, redirects and iframes. WebSockets and service workers are cut off.',
  'security.p2':
    'Known limit: in the browser, Chromium performs its own DNS resolution after this check. The [repository README](https://github.com/kayzen-lyon/linkforge#readme) describes the status of this point.',
  'extract.note':
    'A field is `null` when nothing matches or the value cannot be converted. Strings are cut at 10,000 characters.',
  'html.note':
    '`/meta`, `/extract` and `/content` need an HTML document: for an image, a PDF or any other file type, the API answers `ENOTHTML` (422).',
};

export const a11y: Like<typeof fr.a11y> = {
  'meta.title': 'Accessibility · Omnillink',
  'meta.description':
    'What was built, checked and not checked for accessibility on the Omnillink site, its known limits and how to report a problem.',
  'title': 'Accessibility',
  'updated': 'Last updated: 18 November 2026',
  'intro':
    'KAYZEN wants Omnillink to be usable by everyone, whatever their hardware, software or disability. The site is built to the WCAG 2.2 level AA criteria.',
  'notice':
    'This page is not a statement of conformity. No audit by a person has been carried out yet: it says what was checked, what was not, and what is still imperfect.',
  'built.title': 'What was built',
  'built.1': 'A skip link, identified page regions, a single main heading per page and headings in order.',
  'built.2': 'Every control works with the keyboard: demo tabs with the arrow keys, mobile menu and accessibility panel closed with Escape, focus always visible.',
  'built.3': 'The colours of text, controls and the focus ring are chosen from computed contrast ratios, in the light theme and in the dark theme.',
  'built.4': 'An options panel, at the bottom left of every page: text size, higher contrast, the Atkinson Hyperlegible font, pure black in the dark theme.',
  'built.5': 'Animations are short, and switched off when your system asks for reduced motion.',
  'built.6': 'The language of each page is declared, as is the language of passages written in another language.',
  'built.7': 'Loading states, results and errors in the demo are announced with text, never with colour alone.',
  'built.8': 'Buttons and navigation links offer a target of at least 44 pixels on each side.',
  'checked.title': 'What was checked',
  'checked.intro': 'Checks carried out on 18 November 2026, with automated tools and a review of the rendered pages:',
  'checked.1': 'the contrast ratio of every text and background pair actually used, computed by a script for both themes;',
  'checked.2': 'the keyboard path through the tabs, the mobile menu, the language switcher and the accessibility panel, in a scripted browser;',
  'checked.3': 'no horizontal scrolling at a width of 375 pixels, and no error in the console;',
  'checked.4': 'the rendering of each page in French and in English, in the light and dark themes, on a wide screen and on a phone.',
  'unchecked.title': 'What was not checked',
  'unchecked.1': 'Rendering by screen readers (NVDA, JAWS, VoiceOver, TalkBack).',
  'unchecked.2': 'A criterion-by-criterion audit, WCAG or RGAA, by a trained person.',
  'unchecked.3': 'Voice control, switch devices and other assistive technologies.',
  'unchecked.4': 'Zoom at 400% and the forced-contrast mode of the system.',
  'unchecked.5': 'The PDF documents the API produces from third-party pages.',
  'limits.title': 'Known limits',
  'limits.1': 'The demo shows content that comes from other sites. A screenshot is an image without a detailed description: the Content tab gives its text.',
  'limits.2': 'The structure of extracted content depends on the source page; it may be incomplete.',
  'limits.3': 'Error messages returned by the API are in English. The site adds an explanation in the language of the page.',
  'limits.4': 'Long code samples scroll horizontally inside their own block.',
  'settings.title': 'Adjusting the display',
  'settings.p':
    'The round button at the bottom left opens the accessibility options. Your choices are saved in your browser and apply to every page. The moon button in the header switches between the light and dark themes.',
  'contact.title': 'Reporting a problem',
  'contact.p': 'If some content or a function is not accessible to you, tell us: we will look for a solution with you.',
  'contact.email': 'By email: [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr)',
  'contact.phone': 'By phone: [+33 4 87 77 68 61](tel:+33487776861)',
  'contact.issues': 'On GitHub: [open an issue](https://github.com/kayzen-lyon/linkforge/issues)',
  'disclaimer': 'Page written with the help of an AI tool. It replaces neither an accessibility audit nor legal advice.',
};

export const legal: Like<typeof fr.legal> = {
  'meta.title': 'Legal notice and privacy · Omnillink',
  'meta.description':
    'Publisher and host of the Omnillink site, and what the site stores: no cookies, no trackers, preferences kept in your browser.',
  'title': 'Legal notice and privacy',
  'updated': 'Last updated: 18 November 2026',
  'intro':
    'This site presents Omnillink, an open-source API, and offers a demonstration of it. This page identifies its publisher and its host, then explains what the site stores.',
  'publisher.title': 'Publisher of the site',
  'publisher.p': 'The site is published by Tarek BELHADJ, a sole trader operating under the trade name KAYZEN.',
  'publisher.form': 'Legal form: sole proprietorship under French law (entreprise individuelle, micro-entreprise)',
  'publisher.seat': 'Registered office: 6 rue Pierre Termier, 69009 Lyon, France',
  'publisher.office': 'Premises: 6 rue de Bourgogne, 69009 Lyon, France',
  'publisher.siret': 'SIRET: 493 857 262 00098',
  'publisher.siren': 'SIREN: 493 857 262',
  'publisher.ape': 'APE code: 62.01Z',
  'publisher.vat': 'VAT not applicable, article 293 B of the French General Tax Code',
  'publisher.phone': 'Telephone: [+33 4 87 77 68 61](tel:+33487776861)',
  'publisher.email': 'Email: [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr)',
  'director.title': 'Publication director',
  'director.p': 'Tarek BELHADJ',
  'host.title': 'Host',
  'host.p': 'The site is hosted by Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States, [vercel.com](https://vercel.com).',
  'software.title': 'Software and licence',
  'software.p':
    'Omnillink is free software released under the MIT licence. Its source code is available on [GitHub](https://github.com/kayzen-lyon/linkforge).',
  'privacy.title': 'What the site stores',
  'privacy.none':
    'The site sets no cookies. It loads no analytics tool, no advertising and no third-party script. Fonts are served by the site itself.',
  'storage.title': 'Preferences kept in your browser',
  'storage.p':
    'Three preferences are saved in the local storage of your browser, only when you change them. They are never sent to the server. You erase them by deleting the site data in your browser.',
  'storage.th.key': 'Name',
  'storage.th.purpose': 'Purpose',
  'storage.theme': 'Light or dark theme chosen.',
  'storage.lang': 'Language chosen, French or English.',
  'storage.a11y': 'Accessibility options: text size, contrast, font, pure black.',
  'demo.title': 'When you use the demo',
  'demo.1': 'The address you enter is sent to the API, which reads that page. The result is kept in a cache on the server, for one hour by default. Do not submit an address that contains a secret or a personal token.',
  'demo.2': 'The link preview shows the image and icon of the page straight from the site concerned: your browser therefore contacts that site, which sees your IP address. No referrer is sent to it.',
  'demo.3': 'To limit the request rate, the API counts requests per IP address, in memory, over a one-minute window.',
  'logs.title': 'Technical logs',
  'logs.p':
    'Like any online service, the application and its host produce technical logs: IP address, date and requested address. Their retention period has not been provided: **[period to be specified by the publisher]**.',
  'rights.title': 'Your rights',
  'rights.p':
    'For any question about your data, or to exercise your rights of access, rectification and erasure, write to [contact@kayzen-lyon.fr](mailto:contact@kayzen-lyon.fr). You can also lodge a complaint with the CNIL, the French data protection authority.',
  'disclaimer':
    'Page written with the help of an AI tool from the information supplied by the publisher. It is not legal advice.',
};
