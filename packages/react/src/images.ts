'use client';

/**
 * `<QrCode>` and `<OgImage>`: plain `<img>` elements whose `src` is an
 * Omnillink URL. No effect, no state, no request from JavaScript: they render
 * the same on the server and in the browser, and the browser fetches the image.
 * (Client components only because they read the `<OmnillinkProvider>` context.)
 */
import { createElement, forwardRef, type ImgHTMLAttributes } from 'react';

import type { OgOptions, QrOptions } from '@omnillink/sdk';

import { useOmnillinkConfig } from './context.js';
import { safeHttpUrl } from './link-preview.js';
import { ogImageUrl, qrCodeUrl } from './urls.js';

type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'children' | 'color'>;

export interface QrCodeProps extends ImgProps, QrOptions {
  /** URL to encode: an absolute `http(s)` URL. It is only encoded, never fetched. Anything else renders nothing. */
  readonly url: string;
  /** Origin of the Omnillink instance. Defaults to the nearest `<OmnillinkProvider>`, then to the origin of the page. */
  readonly baseUrl?: string;
  /** Pixel size of the generated image (64–2048, default 512). Also the default `width` and `height` of the `<img>`. */
  readonly size?: number;
}

/**
 * The QR code of a URL, as an `<img>` served by Omnillink (SVG by default).
 *
 * @example
 * <QrCode url="https://example.com" size={256} alt="Scan to open example.com" />
 */
export const QrCode = forwardRef<HTMLImageElement, QrCodeProps>(function QrCode(
  { url, baseUrl, format, size, margin, ecc, color, background, alt, width, height, ...rest },
  ref,
) {
  const config = useOmnillinkConfig();
  const target = safeHttpUrl(url);
  if (target === null) return null;
  const src = qrCodeUrl(baseUrl ?? config.baseUrl, target, { format, size, margin, ecc, color, background });
  return createElement('img', {
    decoding: 'async',
    ...rest,
    ref,
    src,
    alt: alt ?? `QR code of ${target}`,
    width: width ?? size ?? 512,
    height: height ?? size ?? 512,
  });
});

/** Size of the cards the API draws. */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

export interface OgImageProps extends Omit<ImgProps, 'title'>, Omit<OgOptions, 'title'> {
  /** Headline of the card. An empty title renders nothing. */
  readonly title: string;
  /** Origin of the Omnillink instance. Defaults to the nearest `<OmnillinkProvider>`, then to the origin of the page. */
  readonly baseUrl?: string;
}

/**
 * A 1200×630 social card built from text, as an `<img>` served by Omnillink.
 * For `<meta property="og:image">`, use `ogImageUrl()` (or the SDK's `ogUrl()`): a meta tag needs a URL, not an element.
 *
 * @example
 * <OgImage title="Tide tables explained" site="Estuary Gazette" template="gradient" />
 */
export const OgImage = forwardRef<HTMLImageElement, OgImageProps>(function OgImage(
  { title, baseUrl, description, site, author, label, template, theme, accent, format, force, ttl, alt, width, height, ...rest },
  ref,
) {
  const config = useOmnillinkConfig();
  if (typeof title !== 'string' || title.trim() === '') return null;
  const src = ogImageUrl(baseUrl ?? config.baseUrl, { title, description, site, author, label, template, theme, accent, format, force, ttl });
  return createElement('img', {
    decoding: 'async',
    ...rest,
    ref,
    src,
    alt: alt ?? title,
    width: width ?? OG_WIDTH,
    height: height ?? OG_HEIGHT,
  });
});
