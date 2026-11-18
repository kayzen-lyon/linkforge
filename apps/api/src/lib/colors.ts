/**
 * Colours accepted from clients: hexadecimal only. A strict grammar means a
 * colour can be placed in generated SVG or CSS without any escaping question.
 */
import { AppError } from './errors.js';
import type { Rgba } from './png.js';

export const HEX_COLOR_PATTERN = '^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$';
const HEX_COLOR = new RegExp(HEX_COLOR_PATTERN);

/**
 * Parses `#RGB`, `#RRGGBB` or `#RRGGBBAA` (the `#` is optional, since it must
 * be percent-encoded in a query string).
 *
 * @throws {AppError} `EINVALIDPARAMS`.
 */
export function parseHexColor(raw: string, name: string): Rgba & { readonly css: string } {
  if (!HEX_COLOR.test(raw)) {
    throw AppError.invalidParams(`${name}: expected a hexadecimal colour such as 1a2b3c, #1a2b3c or #1a2b3cff`);
  }
  let hex = raw.replace('#', '').toLowerCase();
  if (hex.length === 3) hex = [...hex].map((digit) => digit + digit).join('');
  const channel = (offset: number): number => Number.parseInt(hex.slice(offset, offset + 2), 16);
  return { r: channel(0), g: channel(2), b: channel(4), a: hex.length === 8 ? channel(6) : 255, css: `#${hex}` };
}

/** `#rrggbb` of an RGB triple. */
export function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}
