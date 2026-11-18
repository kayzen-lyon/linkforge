import { describe, expect, it } from 'vitest';

import type { SsrfPolicy } from '../src/config.js';
import { AppError, ErrorCode } from '../src/lib/errors.js';
import { assertSafeUrl, isPublicAddress, parseTargetUrl } from '../src/security/ssrf.js';

const strict: SsrfPolicy = { allowPrivateNetworks: false, allowedPorts: [80, 443] };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'not-an-app-error';
  }
  return undefined;
}

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.5.4',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:10.0.0.1',
    '::127.0.0.1', // IPv4-compatible
    '64:ff9b::7f00:1', // NAT64 wrapping loopback
    'not-an-ip',
  ])('rejects %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'accepts %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe('parseTargetUrl', () => {
  it('accepts a plain https URL', () => {
    expect(parseTargetUrl('https://example.com/a?b=1', strict).href).toBe(
      'https://example.com/a?b=1',
    );
  });

  it.each(['not a url', 'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', ''])(
    'rejects malformed or non-http input: %s',
    (raw) => {
      expect(codeOf(() => parseTargetUrl(raw, strict))).toBe(ErrorCode.InvalidUrl);
    },
  );

  it('rejects embedded credentials', () => {
    expect(codeOf(() => parseTargetUrl('https://user:pass@example.com', strict))).toBe(
      ErrorCode.InvalidUrl,
    );
  });

  it.each([
    'http://localhost/',
    'http://LOCALHOST./',
    'http://app.localhost/',
    'http://printer.local/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://2130706433/', // decimal 127.0.0.1
    'http://0x7f.0.0.1/', // hex
    'http://017700000001/', // octal
    'http://127.1/', // short form
    'http://169.254.169.254/latest/meta-data/',
    'http://[::ffff:7f00:1]/',
    'http://192.168.0.10/',
  ])('blocks internal destination %s', (raw) => {
    expect(codeOf(() => parseTargetUrl(raw, strict))).toBe(ErrorCode.ForbiddenUrl);
  });

  it('blocks ports outside the allow-list', () => {
    expect(codeOf(() => parseTargetUrl('http://example.com:6379/', strict))).toBe(
      ErrorCode.ForbiddenUrl,
    );
  });

  it('allows private targets only when the policy says so', () => {
    const relaxed: SsrfPolicy = { allowPrivateNetworks: true, allowedPorts: 'any' };
    expect(parseTargetUrl('http://127.0.0.1:8080/', relaxed).port).toBe('8080');
  });
});

describe('assertSafeUrl', () => {
  it('rejects a host name that resolves to loopback', async () => {
    // "localhost" is caught syntactically; this checks the DNS layer with a literal.
    await expect(assertSafeUrl('http://127.0.0.1/', strict)).rejects.toMatchObject({
      code: ErrorCode.ForbiddenUrl,
    });
  });

  it('reports unresolvable hosts as unreachable', async () => {
    await expect(assertSafeUrl('https://does-not-exist.invalid/', strict)).rejects.toMatchObject({
      code: ErrorCode.Unreachable,
    });
  });
});
