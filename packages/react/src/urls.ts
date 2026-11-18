/**
 * The URLs behind `<QrCode>` and `<OgImage>`, as plain functions: usable in a
 * Server Component, in `generateMetadata()`, or anywhere a string is needed.
 * This module is not a client module on purpose.
 */
import { createClient, type OgOptions, type QrOptions } from '@omnillink/sdk';

/** URL of a 1200×630 social card, for `<meta property="og:image">`. */
export function ogImageUrl(baseUrl: string, params: OgOptions): string {
  return createClient({ baseUrl }).ogUrl(params);
}

/** URL of the QR code of `url`. */
export function qrCodeUrl(baseUrl: string, url: string, options?: QrOptions): string {
  return createClient({ baseUrl }).qrUrl(url, options);
}
