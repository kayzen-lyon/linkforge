/**
 * Returns the normalised form of an absolute `http(s)` URL, or `null` for
 * anything else (`javascript:`, `data:`, relative paths, non-strings, URLs
 * carrying credentials...).
 *
 * The check runs on the *parsed* URL, so the tricks that fool a prefix test
 * (leading spaces, embedded tabs or newlines, mixed case) do not get through,
 * and the returned string is the parser's own serialisation.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  if (parsed.hostname === '') return null;
  return parsed.href;
}

/** Hostname for display, without a leading `www.`. Empty when the URL is unusable. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}
