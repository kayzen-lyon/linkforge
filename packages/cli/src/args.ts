/**
 * Hand-rolled argument parser: no dependency, strict by default.
 *
 * It understands `--flag value`, `--flag=value`, `--no-flag`, short aliases
 * (`-o file`), repeatable flags and the `--` terminator. Anything it does not
 * recognise is a `UsageError` with a suggestion, never a silent guess.
 */

export type FlagValue = string | number | boolean | readonly string[];

interface BaseSpec {
  /** Kebab-case name, without the leading dashes. */
  readonly name: string;
  /** One-letter alias, without the dash. */
  readonly short?: string;
  readonly description: string;
}

export interface BooleanSpec extends BaseSpec {
  readonly type: 'boolean';
}

export interface StringSpec extends BaseSpec {
  readonly type: 'string';
  /** Placeholder shown in the help, e.g. `<file>`. */
  readonly valueName: string;
  /** The value is never repeated in an error message. */
  readonly secret?: boolean;
}

export interface NumberSpec extends BaseSpec {
  readonly type: 'number';
  readonly valueName: string;
  readonly min?: number;
  readonly max?: number;
  /** Accept a decimal value (`0.8`) instead of an integer. */
  readonly decimal?: boolean;
}

export interface EnumSpec extends BaseSpec {
  readonly type: 'enum';
  readonly choices: readonly string[];
  /** Match the choices without regard to case (`a4` → `A4`). */
  readonly caseInsensitive?: boolean;
}

/** Repeatable; each occurrence may also carry several comma-separated values. */
export interface ListSpec extends BaseSpec {
  readonly type: 'list';
  readonly valueName: string;
  /** Keep each occurrence whole instead of splitting it on commas. */
  readonly noSplit?: boolean;
}

export type FlagSpec = BooleanSpec | StringSpec | NumberSpec | EnumSpec | ListSpec;

export interface ParsedArgs {
  readonly flags: ReadonlyMap<string, FlagValue>;
  readonly positionals: readonly string[];
}

/** A mistake in how the command was invoked. Exit code 2. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
  /** A second line that tells the user what to do next. */
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.hint = hint;
  }
}

/** Where else a flag exists, to explain `--full-page` given to `meta`. */
export interface ForeignFlags {
  readonly command: string;
  readonly specs: readonly FlagSpec[];
}

/** Classic two-row Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** The closest candidate, if it is close enough to be a plausible typo. */
export function closest(input: string, candidates: readonly string[]): string | undefined {
  const normalized = input.toLowerCase().replaceAll('_', '-');
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = editDistance(normalized, candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  // camelCase written for kebab-case (`--fullPage`) is not a typo by distance.
  const dashed = input.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  if (candidates.includes(dashed)) return dashed;
  const threshold = Math.max(1, Math.floor(normalized.length / 3));
  return best !== undefined && bestDistance <= threshold ? best : undefined;
}

const TRUE_WORDS = new Set(['true', '1', 'yes', 'on']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'off']);

function unknownFlag(raw: string, name: string, specs: readonly FlagSpec[], foreign: readonly ForeignFlags[]): UsageError {
  // Only the flag's name is echoed: what follows `=` could be a secret typed
  // after a misspelled `--api-key`.
  const shown = raw.startsWith('--') ? `--${name}` : raw;
  const elsewhere = foreign.find((entry) => entry.specs.some((spec) => spec.name === name));
  if (elsewhere !== undefined) {
    return new UsageError(
      `Unknown option ${shown} for this command`,
      `--${name} belongs to \`omnillink ${elsewhere.command}\`.`,
    );
  }
  const suggestion = closest(name, specs.map((spec) => spec.name));
  return new UsageError(
    `Unknown option ${shown}`,
    suggestion === undefined ? 'Run with --help to list the options.' : `Did you mean --${suggestion}?`,
  );
}

function parseNumber(spec: NumberSpec, raw: string): number {
  const value = raw.trim() === '' ? Number.NaN : Number(raw);
  const { min, max } = spec;
  const range =
    min !== undefined && max !== undefined
      ? ` between ${min} and ${max}`
      : min !== undefined
        ? ` greater than or equal to ${min}`
        : '';
  const shaped = spec.decimal === true ? Number.isFinite(value) : Number.isInteger(value);
  if (!shaped || (min !== undefined && value < min) || (max !== undefined && value > max)) {
    const kind = spec.decimal === true ? 'a number' : 'an integer';
    throw new UsageError(`--${spec.name} expects ${kind}${range}, got ${JSON.stringify(raw)}`);
  }
  return value;
}

function parseEnum(spec: EnumSpec, raw: string): string {
  const match = spec.choices.find((choice) =>
    spec.caseInsensitive === true ? choice.toLowerCase() === raw.toLowerCase() : choice === raw,
  );
  if (match === undefined) {
    const suggestion = closest(raw, spec.choices);
    throw new UsageError(
      `--${spec.name} must be one of ${spec.choices.join(', ')}, got ${JSON.stringify(raw)}`,
      suggestion === undefined ? undefined : `Did you mean ${suggestion}?`,
    );
  }
  return match;
}

/**
 * Parses the arguments that follow the command name.
 *
 * A flag given twice keeps its last value, except lists, which accumulate.
 */
export function parseArgs(
  argv: readonly string[],
  specs: readonly FlagSpec[],
  foreign: readonly ForeignFlags[] = [],
): ParsedArgs {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const byShort = new Map(specs.flatMap((spec) => (spec.short === undefined ? [] : [[spec.short, spec] as const])));
  const flags = new Map<string, FlagValue>();
  const positionals: string[] = [];

  const isKnownFlag = (token: string): boolean => {
    if (token.startsWith('--')) {
      const name = token.slice(2).split('=', 1)[0] ?? '';
      return byName.has(name) || (name.startsWith('no-') && byName.has(name.slice(3)));
    }
    return token.length === 2 && token.startsWith('-') && byShort.has(token.slice(1));
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';

    if (token === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    // A lone dash is the conventional name of standard input.
    if (token === '-' || !token.startsWith('-')) {
      positionals.push(token);
      continue;
    }

    let spec: FlagSpec | undefined;
    let inline: string | undefined;
    let negated = false;
    let display: string;

    if (token.startsWith('--')) {
      const equals = token.indexOf('=');
      const name = equals === -1 ? token.slice(2) : token.slice(2, equals);
      inline = equals === -1 ? undefined : token.slice(equals + 1);
      spec = byName.get(name);
      if (spec === undefined && name.startsWith('no-')) {
        const positive = byName.get(name.slice(3));
        if (positive?.type === 'boolean') {
          spec = positive;
          negated = true;
        }
      }
      if (spec === undefined) throw unknownFlag(token, name, specs, foreign);
      display = `--${name}`;
    } else {
      if (token.length !== 2) {
        throw new UsageError(
          `Unknown option ${token.slice(0, 2)}…`,
          'Short options are written one at a time, with their value as the next argument (-o file.png).',
        );
      }
      spec = byShort.get(token.slice(1));
      if (spec === undefined) {
        throw new UsageError(`Unknown option ${token}`, 'Run with --help to list the options.');
      }
      display = `${token} (--${spec.name})`;
    }

    if (spec.type === 'boolean') {
      if (inline === undefined) {
        flags.set(spec.name, !negated);
        continue;
      }
      const word = inline.toLowerCase();
      if (negated || (!TRUE_WORDS.has(word) && !FALSE_WORDS.has(word))) {
        throw new UsageError(`${display} is a switch: use --${spec.name} or --no-${spec.name}`);
      }
      flags.set(spec.name, TRUE_WORDS.has(word));
      continue;
    }

    let raw = inline;
    if (raw === undefined) {
      const next = argv[index + 1];
      if (next === undefined || next === '--' || isKnownFlag(next)) {
        const expected = spec.type === 'enum' ? spec.choices.join(' | ') : spec.valueName;
        throw new UsageError(`${display} expects a value: ${expected}`);
      }
      raw = next;
      index += 1;
    }

    switch (spec.type) {
      case 'string':
        if (raw === '') throw new UsageError(`${display} expects a non-empty value`);
        flags.set(spec.name, raw);
        break;
      case 'number':
        flags.set(spec.name, parseNumber(spec, raw));
        break;
      case 'enum':
        flags.set(spec.name, parseEnum(spec, raw));
        break;
      case 'list': {
        const previous = flags.get(spec.name);
        const items = spec.noSplit === true ? [raw] : raw.split(',').map((item) => item.trim());
        const kept = items.filter((item) => item !== '');
        if (kept.length === 0) throw new UsageError(`${display} expects a non-empty value`);
        flags.set(spec.name, [...(Array.isArray(previous) ? (previous as readonly string[]) : []), ...kept]);
        break;
      }
    }
  }

  return { flags, positionals };
}

/**
 * Splits `argv` into the command name and the rest, letting global options
 * come first (`omnillink --json meta <url>`). Unknown flags are left for
 * `parseArgs` to report with the right command's options in mind.
 */
export function splitCommand(
  argv: readonly string[],
  globalSpecs: readonly FlagSpec[],
): { command: string | undefined; rest: readonly string[] } {
  const takesValue = (token: string): boolean => {
    if (token.includes('=')) return false;
    const spec = token.startsWith('--')
      ? globalSpecs.find((candidate) => candidate.name === token.slice(2))
      : globalSpecs.find((candidate) => candidate.short === token.slice(1));
    return spec !== undefined && spec.type !== 'boolean';
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';
    if (token === '--') break;
    if (token.startsWith('-') && token !== '-') {
      if (takesValue(token)) index += 1;
      continue;
    }
    return { command: token, rest: [...argv.slice(0, index), ...argv.slice(index + 1)] };
  }
  return { command: undefined, rest: argv };
}
