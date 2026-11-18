/**
 * The JSON Schema subset the tools are described with, and a validator for
 * exactly that subset. One declaration serves both the model (in `tools/list`)
 * and the check of what the model then sends.
 */

export type JsonSchema =
  | {
      readonly type: 'string';
      readonly description?: string;
      readonly enum?: readonly string[];
      readonly minLength?: number;
      readonly maxLength?: number;
      readonly default?: string;
      /** `uri`: must also parse as an absolute http(s) URL. */
      readonly format?: 'uri';
    }
  | {
      readonly type: 'integer';
      readonly description?: string;
      readonly minimum?: number;
      readonly maximum?: number;
      readonly default?: number;
    }
  | { readonly type: 'boolean'; readonly description?: string; readonly default?: boolean }
  | {
      readonly type: 'array';
      readonly description?: string;
      readonly items: JsonSchema;
      readonly minItems?: number;
      readonly maxItems?: number;
    }
  | ObjectSchema;

export interface ObjectSchema {
  readonly type: 'object';
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  /** `false` forbids unknown keys; a schema describes the values of free-form keys. */
  readonly additionalProperties: false | JsonSchema;
  readonly minProperties?: number;
  readonly maxProperties?: number;
}

/** Thrown for arguments that do not match the schema; the message is written for the model. */
export class InvalidArguments extends Error {
  override readonly name = 'InvalidArguments';
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** Collects every problem, so the model can fix its call in one go. */
function check(schema: JsonSchema, value: unknown, path: string, problems: string[]): void {
  const at = path === '' ? 'arguments' : `\`${path}\``;
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return void problems.push(`${at} must be a string`);
      if (schema.enum !== undefined && !schema.enum.includes(value)) {
        return void problems.push(`${at} must be one of ${schema.enum.map((choice) => `"${choice}"`).join(', ')}`);
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${at} must not be empty`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        problems.push(`${at} must be at most ${schema.maxLength} characters`);
      }
      if (schema.format === 'uri' && !isHttpUrl(value)) {
        problems.push(`${at} must be an absolute http(s) URL without credentials, e.g. "https://example.com/page"`);
      }
      return;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return void problems.push(`${at} must be an integer`);
      if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${at} must be at least ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${at} must be at most ${schema.maximum}`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') problems.push(`${at} must be true or false`);
      return;
    case 'array':
      if (!Array.isArray(value)) return void problems.push(`${at} must be an array`);
      if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${at} needs at least ${schema.minItems} item(s)`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${at} accepts at most ${schema.maxItems} items`);
      value.forEach((item, index) => check(schema.items, item, `${path}[${index}]`, problems));
      return;
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return void problems.push(`${at} must be an object`);
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record);
      for (const name of schema.required ?? []) {
        if (record[name] === undefined) problems.push(`\`${path === '' ? name : `${path}.${name}`}\` is required`);
      }
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) problems.push(`${at} needs at least ${schema.minProperties} entry`);
      if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) problems.push(`${at} accepts at most ${schema.maxProperties} entries`);
      for (const key of keys) {
        const child = path === '' ? key : `${path}.${key}`;
        const property = schema.properties?.[key];
        if (property !== undefined) {
          if (record[key] !== undefined) check(property, record[key], child, problems);
        } else if (schema.additionalProperties === false) {
          const known = Object.keys(schema.properties ?? {});
          problems.push(`\`${child}\` is not a known parameter (known: ${known.join(', ')})`);
        } else {
          check(schema.additionalProperties, record[key], child, problems);
        }
      }
    }
  }
}

export function validate(schema: ObjectSchema, value: unknown): Record<string, unknown> {
  const problems: string[] = [];
  check(schema, value ?? {}, '', problems);
  if (problems.length > 0) {
    throw new InvalidArguments(`Invalid arguments: ${problems.slice(0, 8).join('; ')}.`);
  }
  return (value ?? {}) as Record<string, unknown>;
}
