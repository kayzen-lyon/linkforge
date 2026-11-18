/**
 * Hardening of client-supplied CSS selectors.
 *
 * Selectors are the only client-controlled "code" the API accepts. They are
 * bounded in size and number, restricted to the CSS dialect, and never
 * concatenated into a script or a stylesheet rule that could hold more than
 * one selector.
 */
import { AppError } from './errors.js';

/** Bounds of selector-list parameters (`hide`, `include`, `exclude`). */
export const MAX_LIST_SELECTORS = 20;
export const MAX_LIST_SELECTOR_LENGTH = 200;
/** Longest single selector (`selector`, `waitForSelector`). */
export const MAX_SELECTOR_LENGTH = 300;

/**
 * Splits a comma-separated selector list into individual selectors.
 *
 * Commas nested in `()`, `[]` or quotes belong to a selector (`:is(a, b)`).
 * Characters that could close a generated rule and open another one are
 * refused outright rather than escaped: no legitimate selector needs them.
 *
 * @param name - Parameter name, used in error messages.
 * @throws {AppError} `EINVALIDPARAMS` when a selector is refused or a bound is exceeded.
 */
export function parseSelectorList(raw: string, name: string): string[] {
  if (/[{}<;@]|\/\*/.test(raw)) {
    throw AppError.invalidParams(`${name}: selectors must not contain { } ; @ < or comments`);
  }

  const selectors: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw.charAt(i);
    if (char === '\\') {
      // A CSS escape protects the next character (`.md\:flex`, `\,`).
      current += char + raw.charAt(i + 1);
      i += 1;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1);
    } else if (char === ',' && depth === 0) {
      selectors.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  selectors.push(current);

  const cleaned = selectors.map((selector) => selector.trim()).filter((selector) => selector !== '');
  if (cleaned.length > MAX_LIST_SELECTORS) {
    throw AppError.invalidParams(`${name}: at most ${MAX_LIST_SELECTORS} selectors are allowed`);
  }
  if (cleaned.some((selector) => selector.length > MAX_LIST_SELECTOR_LENGTH)) {
    throw AppError.invalidParams(
      `${name}: a selector is longer than ${MAX_LIST_SELECTOR_LENGTH} characters`,
    );
  }
  return cleaned;
}

/**
 * Validates a single selector meant for the browser's selector engine.
 *
 * Playwright accepts other engines through a prefix (`xpath=`, `text=`,
 * `internal:`...) or a leading `//`; callers pin the dialect by passing the
 * result as `css=<selector>`, and the obvious attempts are refused here so the
 * client gets a 400 instead of a timeout.
 *
 * @throws {AppError} `EINVALIDPARAMS`.
 */
export function assertCssSelector(raw: string, name: string): string {
  const selector = raw.trim();
  if (selector === '' || selector.length > MAX_SELECTOR_LENGTH) {
    throw AppError.invalidParams(`${name}: must be 1 to ${MAX_SELECTOR_LENGTH} characters`);
  }
  if (/^[a-z:_-]+=|^\/\/|^\.\.|>>/i.test(selector) || /[{}<;@]|\/\*/.test(selector)) {
    throw AppError.invalidParams(`${name}: only CSS selectors are accepted`);
  }
  return selector;
}
