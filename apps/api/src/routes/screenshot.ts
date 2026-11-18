import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';

import { HEX_COLOR_PATTERN, parseHexColor } from '../lib/colors.js';
import { ErrorCode } from '../lib/errors.js';
import { TARGET_ERRORS, type EndpointDoc } from '../openapi.js';
import type { ScreenshotService } from '../services/screenshot-service.js';
import {
  CACHE_HEADERS,
  cacheControl,
  ForceParam,
  TargetHeaderParams,
  targetHeadersOf,
  TtlParam,
  UrlParam,
  WaitForSelectorParam,
} from './shared.js';

const ScreenshotQuery = Type.Object(
  {
    url: UrlParam,
    device: Type.Optional(
      Type.Enum(['desktop', 'mobile'], {
        type: 'string',
        default: 'desktop',
        description: '`desktop`: 1280×800. `mobile`: Pixel 7 profile (UA, DPR, touch).',
      }),
    ),
    width: Type.Optional(
      Type.Integer({
        minimum: 320,
        maximum: 2560,
        description: 'Viewport width in CSS pixels, overriding the device preset.',
      }),
    ),
    height: Type.Optional(
      Type.Integer({
        minimum: 240,
        maximum: 2160,
        description: 'Viewport height in CSS pixels, overriding the device preset.',
      }),
    ),
    fullPage: Type.Optional(
      Type.Boolean({
        default: false,
        description:
          'Capture the whole page (capped at 12 000 px high), after one scroll pass that ' +
          'lets lazy content load. Ignored with `selector`.',
      }),
    ),
    selector: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 300,
        description: 'CSS selector: capture only the first matching element.',
      }),
    ),
    hide: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 2000,
        description:
          'Comma-separated CSS selectors of elements to hide before the capture ' +
          '(cookie banners, ads). At most 20 selectors of 200 characters.',
      }),
    ),
    hideBanners: Type.Optional(
      Type.Boolean({
        default: true,
        description:
          'Hide common cookie / consent banners before the capture, with a built-in ' +
          'stylesheet (nothing is clicked, no consent is given).',
      }),
    ),
    blockAds: Type.Optional(
      Type.Boolean({
        default: false,
        description:
          'Drop requests to a built-in list of well-known advertising and tracking hosts ' +
          '(faster, cleaner captures). Not a full ad blocker.',
      }),
    ),
    waitForSelector: WaitForSelectorParam,
    click: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 300,
        description:
          'CSS selector of one element to click before the capture (open a tab, expand a ' +
          'section). A real click on the first visible match; not found within 3 s: ' +
          '`404 ESELECTORNOTFOUND`. CSS only, no script.',
      }),
    ),
    scrollTo: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 300,
        description: 'CSS selector of an element to scroll into view before the capture. Not found within 3 s: `404 ESELECTORNOTFOUND`.',
      }),
    ),
    waitFor: Type.Optional(
      Type.Integer({
        minimum: 0,
        maximum: 10_000,
        default: 0,
        description: 'Extra wait before the capture, in milliseconds.',
      }),
    ),
    colorScheme: Type.Optional(
      Type.Enum(['light', 'dark'], {
        type: 'string',
        description: 'Emulated `prefers-color-scheme`.',
      }),
    ),
    frame: Type.Optional(
      Type.Enum(['none', 'browser', 'phone'], {
        type: 'string',
        default: 'none',
        description:
          'Device frame drawn around the capture: a browser window or a phone bezel. Composed ' +
          'offline from the finished capture. Not available with `fullPage`.',
      }),
    ),
    radius: Type.Optional(
      Type.Integer({ minimum: 0, maximum: 64, default: 0, description: 'Corner radius of the capture, in pixels.' }),
    ),
    padding: Type.Optional(
      Type.Integer({ minimum: 0, maximum: 200, default: 0, description: 'Space around the capture, in pixels, filled with `background`.' }),
    ),
    background: Type.Optional(
      Type.String({
        pattern: HEX_COLOR_PATTERN,
        default: 'ffffff',
        description:
          'Colour behind the capture when `frame`, `radius` or `padding` is used: hexadecimal ' +
          '`RGB`, `RRGGBB` or `RRGGBBAA`, with or without `#`. `00000000` is transparent (PNG).',
      }),
    ),
    format: Type.Optional(Type.Enum(['png', 'jpeg'], { type: 'string', default: 'png' })),
    quality: Type.Optional(
      Type.Integer({ minimum: 1, maximum: 100, default: 80, description: 'JPEG only.' }),
    ),
    ...TargetHeaderParams,
    force: ForceParam,
    ttl: TtlParam,
  },
  { additionalProperties: false },
);

const Binary = Type.String({ format: 'binary' });

export const screenshotDoc: EndpointDoc = {
  path: '/api/v1/screenshot',
  operationId: 'getScreenshot',
  summary: 'Page or element screenshot',
  description: 'Responds with the raw image, so the URL can be used directly as an `<img src>`.',
  tag: 'Rendering',
  query: ScreenshotQuery,
  responses: {
    '200': {
      description: 'The image.',
      headers: CACHE_HEADERS,
      content: { 'image/png': Binary, 'image/jpeg': Binary },
    },
  },
  errors: [...TARGET_ERRORS, ErrorCode.SelectorNotFound, ErrorCode.NotHtml],
};

export interface ScreenshotRouteOptions {
  readonly screenshotService: ScreenshotService;
}

/**
 * `GET /api/v1/screenshot?url=...&device=desktop|mobile` — page capture.
 *
 * Responds with the raw image (`image/png` or `image/jpeg`), so the endpoint
 * can be used directly as an `<img src>`.
 */
export const screenshotRoutes: FastifyPluginAsyncTypebox<ScreenshotRouteOptions> = async (
  app,
  options,
) => {
  app.get('/screenshot', { schema: { querystring: ScreenshotQuery } }, async (request, reply) => {
    const {
      url,
      device = 'desktop',
      fullPage = false,
      format = 'png',
      quality = 80,
      force = false,
      waitFor = 0,
    } = request.query;

    const result = await options.screenshotService.capture({
      url,
      device,
      fullPage,
      format,
      quality,
      width: request.query.width ?? null,
      height: request.query.height ?? null,
      selector: request.query.selector ?? null,
      waitForMs: waitFor,
      colorScheme: request.query.colorScheme ?? null,
      hide: request.query.hide ?? null,
      hideBanners: request.query.hideBanners ?? true,
      blockAds: request.query.blockAds ?? false,
      waitForSelector: request.query.waitForSelector ?? null,
      click: request.query.click ?? null,
      scrollTo: request.query.scrollTo ?? null,
      decoration: {
        frame: request.query.frame ?? 'none',
        radius: request.query.radius ?? 0,
        padding: request.query.padding ?? 0,
        background: parseHexColor(request.query.background ?? 'ffffff', 'background').css,
      },
      headers: targetHeadersOf(request.query),
      force,
      ttlSeconds: request.query.ttl ?? null,
    });

    return reply
      .header('content-type', result.contentType)
      .header('x-cache', result.cached ? 'HIT' : 'MISS')
      .header('x-render-source', 'browser')
      .header('cache-control', cacheControl(result.ttlSeconds))
      .send(result.image);
  });
};
