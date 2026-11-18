/**
 * Custom scraping rules for `/extract` (pure, no I/O): parsing and validating
 * the client's `fields` description, then applying it to a document.
 *
 * Everything here is client-controlled, so every dimension is bounded: number
 * of fields, selector length, number of matches and size of each value.
 */
import { load } from 'cheerio';

import { AppError } from '../lib/errors.js';

export type FieldType = 'string' | 'number' | 'url';

export interface FieldRule {
  /** CSS selector locating the element(s). */
  readonly selector: string;
  /** `text`, `html`, or the name of an attribute to read. */
  readonly attr: string;
  readonly type: FieldType;
  /** When true every match is returned (as an array) instead of the first one. */
  readonly all: boolean;
}

/** Validated rules, keyed by field name, in the order the client gave them. */
export type FieldRules = ReadonlyArray<readonly [name: string, rule: FieldRule]>;

export type FieldScalar = string | number;
export type FieldValue = FieldScalar | null | FieldScalar[];

/** Limits of the `fields` parameter; they are part of the public contract. */
export const EXTRACT_LIMITS = {
  maxFields: 20,
  maxSelectorLength: 300,
  /** Matches kept for a field declared with `all`. */
  maxItems: 100,
  /** Characters kept per extracted value. */
  maxValueLength: 10_000,
} as const;

const FIELD_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]{0,63}$/;
const RULE_KEYS = new Set(['selector', 'attr', 'type', 'all']);
const TYPES: readonly string[] = ['string', 'number', 'url'];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalid = (message: string): AppError => AppError.invalidParams(`fields: ${message}`);

function parseRule(name: string, raw: unknown): FieldRule {
  if (!isPlainObject(raw)) throw invalid(`"${name}" must be an object`);
  for (const key of Object.keys(raw)) {
    if (!RULE_KEYS.has(key)) throw invalid(`"${name}" has an unknown property "${key}"`);
  }

  const { selector, attr = 'text', type = 'string', all = false } = raw;
  if (typeof selector !== 'string' || selector.trim() === '') {
    throw invalid(`"${name}.selector" must be a non-empty string`);
  }
  if (selector.length > EXTRACT_LIMITS.maxSelectorLength) {
    throw invalid(
      `"${name}.selector" is longer than ${EXTRACT_LIMITS.maxSelectorLength} characters`,
    );
  }
  if (typeof attr !== 'string' || !ATTRIBUTE_NAME.test(attr)) {
    throw invalid(`"${name}.attr" must be "text", "html" or an attribute name`);
  }
  if (typeof type !== 'string' || !TYPES.includes(type)) {
    throw invalid(`"${name}.type" must be "string", "number" or "url"`);
  }
  if (typeof all !== 'boolean') throw invalid(`"${name}.all" must be a boolean`);

  try {
    // Compiles the selector against an empty document: a syntax error surfaces
    // now, as a 400, instead of later in the middle of an extraction.
    load('')(selector);
  } catch {
    throw invalid(`"${name}.selector" is not a valid CSS selector`);
  }

  return { selector, attr: attr.toLowerCase(), type: type as FieldType, all };
}

/**
 * Parses and validates the JSON-encoded `fields` parameter.
 *
 * @throws {AppError} `EINVALIDPARAMS` when the JSON or any rule is invalid.
 */
export function parseFieldRules(raw: string): FieldRules {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid('must be a JSON-encoded object');
  }
  if (!isPlainObject(parsed)) throw invalid('must be a JSON-encoded object');

  const entries = Object.entries(parsed);
  if (entries.length === 0) throw invalid('must declare at least one field');
  if (entries.length > EXTRACT_LIMITS.maxFields) {
    throw invalid(`at most ${EXTRACT_LIMITS.maxFields} fields are allowed`);
  }

  return entries.map(([name, rule]) => {
    // `__proto__` would silently vanish from the response object.
    if (!FIELD_NAME.test(name) || name === '__proto__') {
      throw invalid(`"${name.slice(0, 64)}" is not a valid field name`);
    }
    return [name, parseRule(name, rule)] as const;
  });
}

/**
 * Reads a number out of human-formatted text: `$1,299.00`, `1 299,00 €`,
 * `-3.5%`. With both separators present the last one is the decimal mark; a
 * lone separator followed by exactly three digits is a thousands separator.
 */
export function parseNumber(text: string): number | null {
  const match = text.match(/-?\d[\d\s.,'’  ]*/)?.[0];
  if (match === undefined) return null;
  let digits = match.replace(/[\s'’  ]/g, '').replace(/[.,]+$/, '');

  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    digits = digits.split(thousands).join('').replace(decimal, '.');
  } else {
    const separator = lastDot !== -1 ? '.' : lastComma !== -1 ? ',' : null;
    if (separator !== null) {
      const groups = digits.split(separator);
      const grouped = groups.slice(1).every((group) => group.length === 3);
      // "1,299" and "1.299.000" are grouped integers; "1.299" stays a decimal.
      const isThousands = grouped && (separator === ',' || groups.length > 2);
      digits = isThousands ? groups.join('') : groups.join('.');
    }
  }

  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

function resolveHttpUrl(reference: string, base: string): string | null {
  try {
    const url = new URL(reference.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function convert(raw: string | null | undefined, rule: FieldRule, base: string): FieldScalar | null {
  if (raw === null || raw === undefined) return null;
  // Markup keeps its whitespace; everything else is normalised like visible text.
  const value = rule.attr === 'html' ? raw.trim() : raw.replace(/\s+/g, ' ').trim();
  if (value === '') return null;

  switch (rule.type) {
    case 'number':
      return parseNumber(value);
    case 'url':
      return resolveHttpUrl(value, base);
    default:
      return value.slice(0, EXTRACT_LIMITS.maxValueLength);
  }
}

/**
 * Applies extraction rules to an HTML document.
 *
 * A field that matches nothing (or whose value cannot be converted) is `null`,
 * or `[]` when declared with `all`.
 *
 * @param html - Raw or rendered markup.
 * @param documentUrl - Final URL of the document, used to resolve `url` fields.
 */
export function extractFields(
  html: string,
  documentUrl: string,
  rules: FieldRules,
): Record<string, FieldValue> {
  const $ = load(html);
  const base = resolveHttpUrl($('base[href]').first().attr('href') ?? '', documentUrl) ?? documentUrl;

  const read = (element: Parameters<typeof $>[0], rule: FieldRule): FieldScalar | null => {
    const node = $(element);
    const raw =
      rule.attr === 'text' ? node.text() : rule.attr === 'html' ? node.html() : node.attr(rule.attr);
    return convert(raw, rule, base);
  };

  const fields: Array<[string, FieldValue]> = rules.map(([name, rule]) => {
    const matches = $(rule.selector);
    if (!rule.all) {
      const first = matches.get(0);
      return [name, first === undefined ? null : read(first, rule)];
    }
    const values: FieldScalar[] = [];
    for (const element of matches.toArray()) {
      if (values.length >= EXTRACT_LIMITS.maxItems) break;
      const value = read(element, rule);
      if (value !== null) values.push(value);
    }
    return [name, values];
  });
  return Object.fromEntries(fields);
}

/** True when at least one field came back empty (`null` or `[]`). */
export function hasEmptyField(fields: Readonly<Record<string, FieldValue>>): boolean {
  return Object.values(fields).some(
    (value) => value === null || (Array.isArray(value) && value.length === 0),
  );
}
