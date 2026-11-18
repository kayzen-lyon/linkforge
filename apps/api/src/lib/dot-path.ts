/**
 * Dot-path lookup into plain JSON data (`image.url`, `images.0.url`, `title`).
 *
 * Backs the `embed` parameter of `/meta`. The path comes from the query
 * string, so the walk only ever follows *own* properties: `constructor` or
 * `__proto__` must resolve to nothing rather than to a prototype member.
 */

/** Syntax accepted for a dot path (also enforced by the route schema). */
export const DOT_PATH_PATTERN = '^[A-Za-z0-9_@:-]+(\\.[A-Za-z0-9_@:-]+)*$';

/**
 * Resolves `path` inside `data`.
 *
 * @returns The value found, or `undefined` when any segment is missing.
 */
export function resolveDotPath(data: unknown, path: string): unknown {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    if (!Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Normalises an absolute `http:` / `https:` URL.
 *
 * @returns The ASCII-safe form of the URL (usable in a `Location` header), or
 *   `null` when the value is anything else.
 */
export function toHttpUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value) || !URL.canParse(value)) return null;
  return new URL(value).href;
}
