import { describe, expect, it } from 'vitest';

import { closest, editDistance, parseArgs, splitCommand, UsageError, type FlagSpec } from '../src/args.js';
import { COMMANDS, findCommand, GLOBAL_FLAGS } from '../src/commands.js';

const shot = findCommand('shot');
if (shot === undefined) throw new Error('shot command missing');
const specs: readonly FlagSpec[] = [...GLOBAL_FLAGS, ...shot.flags];
const foreign = COMMANDS.filter((c) => c.name !== 'shot').map((c) => ({ command: c.name, specs: c.flags }));

const usage = (argv: string[]): UsageError => {
  try {
    parseArgs(argv, specs, foreign);
  } catch (error) {
    if (error instanceof UsageError) return error;
    throw error;
  }
  throw new Error('expected a UsageError');
};

describe('parseArgs()', () => {
  it('reads values after a space or an equals sign', () => {
    const { flags, positionals } = parseArgs(['https://a.test', '--device', 'mobile', '--quality=80', '-o', 'a.png'], specs);
    expect(positionals).toEqual(['https://a.test']);
    expect(Object.fromEntries(flags)).toEqual({ device: 'mobile', quality: 80, output: 'a.png' });
  });

  it('handles switches, their negation and explicit booleans', () => {
    const { flags } = parseArgs(['--full-page', '--no-color', '--force=false', '--json=yes'], specs);
    expect(Object.fromEntries(flags)).toEqual({ 'full-page': true, color: false, force: false, json: true });
  });

  it('accumulates lists, split on commas', () => {
    const { flags } = parseArgs(['--hide', '.banner, #ads', '--hide=.modal'], specs);
    expect(flags.get('hide')).toEqual(['.banner', '#ads', '.modal']);
  });

  it('keeps the last value of a repeated flag', () => {
    expect(parseArgs(['--width', '100', '--width', '200'], specs).flags.get('width')).toBe(200);
  });

  it('treats everything after -- as positional, and a lone dash as stdin', () => {
    expect(parseArgs(['-', '--', '--json', '-x'], specs).positionals).toEqual(['-', '--json', '-x']);
  });

  it('normalises case-insensitive choices', () => {
    const pdf = findCommand('pdf');
    expect(parseArgs(['--format', 'letter'], pdf?.flags ?? []).flags.get('format')).toBe('Letter');
  });

  it('suggests the closest flag for a typo', () => {
    const error = usage(['--qualty', '80']);
    expect(error.message).toBe('Unknown option --qualty');
    expect(error.hint).toBe('Did you mean --quality?');
  });

  it('suggests the kebab-case spelling of a camelCase flag', () => {
    expect(usage(['--fullPage']).hint).toBe('Did you mean --full-page?');
    expect(usage(['--color_scheme', 'dark']).hint).toBe('Did you mean --color-scheme?');
  });

  it('says which command owns a flag given to the wrong one', () => {
    const error = usage(['--landscape']);
    expect(error.message).toBe('Unknown option --landscape for this command');
    expect(error.hint).toBe('--landscape belongs to `omnillink pdf`.');
  });

  it('never repeats the value of an unknown flag', () => {
    const error = usage(['--apikey=sk-very-secret']);
    expect(`${error.message} ${error.hint}`).not.toContain('sk-very-secret');
    expect(error.hint).toBe('Did you mean --api-key?');
  });

  it('reports a missing value instead of swallowing the next flag', () => {
    expect(usage(['--output', '--json']).message).toBe('--output expects a value: <file>');
    expect(usage(['--device']).message).toBe('--device expects a value: desktop | mobile');
  });

  it('validates numbers and choices', () => {
    expect(usage(['--quality', '0']).message).toBe('--quality expects an integer between 1 and 100, got "0"');
    expect(usage(['--width', 'wide']).message).toBe('--width expects an integer greater than or equal to 1, got "wide"');
    const error = usage(['--device', 'mobil']);
    expect(error.message).toBe('--device must be one of desktop, mobile, got "mobil"');
    expect(error.hint).toBe('Did you mean mobile?');
  });

  it('rejects a value on a negated switch and bundled short options', () => {
    expect(usage(['--no-force=true']).message).toContain('is a switch');
    expect(usage(['-jo']).message).toBe('Unknown option -j…');
  });
});

describe('splitCommand()', () => {
  it('finds the command after global options and their values', () => {
    expect(splitCommand(['--base-url', 'http://x', '--json', 'meta', 'https://a.test'], GLOBAL_FLAGS)).toEqual({
      command: 'meta',
      rest: ['--base-url', 'http://x', '--json', 'https://a.test'],
    });
  });

  it('returns no command for flags only', () => {
    expect(splitCommand(['--version'], GLOBAL_FLAGS).command).toBeUndefined();
  });
});

describe('suggestions', () => {
  it('measures edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('stays silent when nothing is close', () => {
    expect(closest('zzzzzz', ['meta', 'shot'])).toBeUndefined();
    expect(closest('mta', ['meta', 'shot'])).toBe('meta');
  });
});
