/**
 * Turns an API answer into what the card shows. Pure: no DOM, no I/O.
 *
 * The answer describes an arbitrary third-party page, so nothing in it is
 * trusted: every field is type-checked, text is flattened and bounded, and
 * URLs only survive when they are absolute http(s).
 */
import { displayHost, safeHttpUrl } from './safe-url.js';

export interface CardModel {
  /** Where the card links to: the URL the page author asked a preview for. */
  readonly href: string;
  /** Host of the final document, shown so the destination is never hidden. */
  readonly host: string;
  readonly title: string;
  readonly description: string | null;
  /** Site name; `null` when it would only repeat the host. */
  readonly publisher: string | null;
  readonly imageUrl: string | null;
  readonly iconUrl: string | null;
  /** Letter drawn in place of a missing image. */
  readonly monogram: string;
  /** BCP 47 tag of the text, when the page declares a plausible one. */
  readonly lang: string | null;
}

const MAX_TITLE = 300;
const MAX_DESCRIPTION = 600;
const MAX_PUBLISHER = 80;
const LANG_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,4}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Collapses whitespace and control characters, then bounds the length. */
export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
  if (flat === '') return null;
  if (flat.length <= maxLength) return flat;
  return `${Array.from(flat).slice(0, maxLength - 1).join('').trimEnd()}…`;
}

const urlOf = (value: unknown): string | null =>
  isRecord(value) ? safeHttpUrl(value['url']) : null;

function pickImage(data: Record<string, unknown>): string | null {
  const primary = urlOf(data['image']);
  if (primary !== null) return primary;
  const images = data['images'];
  if (Array.isArray(images)) {
    for (const candidate of images.slice(0, 10)) {
      const url = urlOf(candidate);
      if (url !== null) return url;
    }
  }
  return null;
}

/**
 * @param data - `data` of `GET /meta`, typed `unknown` on purpose.
 * @param requestedUrl - The already validated URL of the `url` attribute.
 */
export function buildCardModel(data: unknown, requestedUrl: string): CardModel {
  const record = isRecord(data) ? data : {};
  const finalUrl = safeHttpUrl(record['url']) ?? requestedUrl;
  const host = displayHost(finalUrl) || displayHost(requestedUrl);

  const rawPublisher = cleanText(record['publisher'], MAX_PUBLISHER);
  const publisher =
    rawPublisher !== null && rawPublisher.toLowerCase() !== host.toLowerCase() ? rawPublisher : null;
  const title = cleanText(record['title'], MAX_TITLE) ?? rawPublisher ?? host;
  const rawLang = record['lang'];

  return {
    href: requestedUrl,
    host,
    title,
    description: cleanText(record['description'], MAX_DESCRIPTION),
    publisher,
    imageUrl: pickImage(record),
    iconUrl: urlOf(record['logo']) ?? safeHttpUrl(record['favicon']),
    monogram: (Array.from((rawPublisher ?? host).replace(/[^\p{L}\p{N}]/gu, ''))[0] ?? '#').toUpperCase(),
    lang: typeof rawLang === 'string' && LANG_TAG.test(rawLang) ? rawLang : null,
  };
}
