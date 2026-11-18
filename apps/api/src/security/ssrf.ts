/**
 * Anti-SSRF layer.
 *
 * A link-preview service fetches arbitrary user-supplied URLs from inside our
 * infrastructure, which makes Server-Side Request Forgery the number one
 * threat. Defence is applied in depth:
 *
 * 1. **Syntactic validation** ({@link parseTargetUrl}): http(s) only, no
 *    embedded credentials, allow-listed ports, no internal host names.
 * 2. **Resolution check** ({@link assertSafeUrl}): the host is resolved and
 *    *every* returned address must be a public unicast address.
 * 3. **Connection-time pinning** ({@link createSafeLookup}): the HTTP client
 *    resolves through a guarded `lookup`, so the address that was validated is
 *    the address that is dialled (defeats DNS rebinding for the raw fetcher).
 * 4. **Every redirect hop and every browser sub-request** goes through the
 *    same checks (see `fetcher.ts` and `browser-guard.ts`).
 */
import dns from 'node:dns';
import type { LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';

import ipaddr from 'ipaddr.js';

import type { SsrfPolicy } from '../config.js';
import { AppError } from '../lib/errors.js';

/** Host names (and suffixes) that always designate internal resources. */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback', 'broadcasthost']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet'];

const MAX_URL_LENGTH = 2048;

/**
 * Tells whether an IP literal is a globally routable unicast address.
 *
 * Anything else — loopback, RFC 1918, link-local (cloud metadata lives at
 * 169.254.169.254), CGNAT, multicast, reserved, unique-local IPv6, NAT64,
 * 6to4, Teredo... — is refused. IPv4-mapped IPv6 addresses are unwrapped
 * first so `::ffff:127.0.0.1` cannot be used as a bypass.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.process(address);

  if (parsed.kind() === 'ipv6') {
    // Deprecated "IPv4-compatible" form (::a.b.c.d): refuse the whole ::/96 block.
    const parts = (parsed as ipaddr.IPv6).parts;
    if (parts.slice(0, 6).every((part) => part === 0)) return false;
  }

  return parsed.range() === 'unicast';
}

/** Strips the brackets WHATWG URLs put around IPv6 literals. */
function bareHostname(url: URL): string {
  const host = url.hostname;
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function effectivePort(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * Parses and syntactically validates a user-supplied target URL.
 *
 * The WHATWG parser normalises exotic IPv4 notations (`0x7f.1`, `2130706433`,
 * `017700000001`) to dotted-decimal, so later range checks cannot be bypassed
 * with alternative encodings.
 *
 * @throws {AppError} `EINVALIDURL` for malformed input, `EFORBIDDENURL` when
 *   the policy refuses the destination.
 */
export function parseTargetUrl(raw: string, policy: SsrfPolicy): URL {
  if (raw.length > MAX_URL_LENGTH) {
    throw AppError.invalidUrl(`URL exceeds ${MAX_URL_LENGTH} characters`);
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw AppError.invalidUrl('The "url" parameter is not a valid absolute URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw AppError.invalidUrl('Only http:// and https:// URLs are supported');
  }
  if (url.username !== '' || url.password !== '') {
    throw AppError.invalidUrl('URLs with embedded credentials are not supported');
  }

  const hostname = bareHostname(url).toLowerCase().replace(/\.$/, '');
  if (hostname === '') throw AppError.invalidUrl('The URL has no host');

  if (policy.allowedPorts !== 'any' && !policy.allowedPorts.includes(effectivePort(url))) {
    throw AppError.forbiddenUrl(`Destination port ${effectivePort(url)} is not allowed`);
  }

  if (!policy.allowPrivateNetworks) {
    if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
      throw AppError.forbiddenUrl('Internal host names are not allowed');
    }
    if (ipaddr.isValid(hostname) && !isPublicAddress(hostname)) {
      throw AppError.forbiddenUrl('Private, loopback and reserved IP addresses are not allowed');
    }
  }

  return url;
}

/**
 * Resolves a host name and verifies that every address is public.
 *
 * @returns The resolved addresses (useful for logging / pinning).
 * @throws {AppError} `EUNREACHABLE` when DNS fails, `EFORBIDDENURL` when any
 *   record points to a non-public address (a single private record is enough
 *   to refuse: attackers mix public and private records to race validators).
 */
export async function resolvePublicAddresses(
  hostname: string,
  policy: SsrfPolicy,
): Promise<LookupAddress[]> {
  let addresses: LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw AppError.unreachable(`Could not resolve host "${hostname}"`, error);
  }
  if (addresses.length === 0) {
    throw AppError.unreachable(`Host "${hostname}" has no DNS records`);
  }
  if (!policy.allowPrivateNetworks && !addresses.every((a) => isPublicAddress(a.address))) {
    throw AppError.forbiddenUrl('The host resolves to a private, loopback or reserved address');
  }
  return addresses;
}

/**
 * Full validation of a destination: syntax + policy + DNS resolution.
 *
 * Must be called for the initial URL **and for every redirect hop**.
 *
 * @returns The parsed, normalised URL.
 */
export async function assertSafeUrl(raw: string | URL, policy: SsrfPolicy): Promise<URL> {
  const url = parseTargetUrl(typeof raw === 'string' ? raw : raw.href, policy);
  await resolvePublicAddresses(bareHostname(url), policy);
  return url;
}

/**
 * Builds a `net.connect`-compatible `lookup` that refuses non-public addresses.
 *
 * Plugged into the HTTP client's connector, it guarantees the socket is opened
 * to an address that passed validation *at connection time*, closing the
 * time-of-check/time-of-use window exploited by DNS rebinding.
 *
 * Note: Node does not call `lookup` for IP literals, which is why
 * {@link parseTargetUrl} validates literals up-front.
 */
export function createSafeLookup(policy: SsrfPolicy): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (error, result) => {
      if (error) {
        callback(error, '', 0);
        return;
      }
      const addresses = result as LookupAddress[];
      if (!policy.allowPrivateNetworks && !addresses.every((a) => isPublicAddress(a.address))) {
        const blocked = AppError.forbiddenUrl(
          'The host resolves to a private, loopback or reserved address',
        );
        callback(blocked as unknown as NodeJS.ErrnoException, '', 0);
        return;
      }
      if (options.all === true) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      if (first === undefined) {
        callback(new Error(`No address found for ${hostname}`) as NodeJS.ErrnoException, '', 0);
        return;
      }
      callback(null, first.address, first.family);
    });
  };
}
