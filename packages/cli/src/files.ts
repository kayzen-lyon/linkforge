/**
 * File names for `--output-dir`. The URLs may come from an untrusted list, so
 * a name is rebuilt from an allow-list of characters and can never leave the
 * directory it is meant for.
 */
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  // An animated PNG is a PNG to anything that does not animate it.
  'image/apng': 'png',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

export function extensionFor(mediaType: string, fallback: string): string {
  const essence = mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return EXTENSIONS[essence] ?? fallback;
}

/**
 * `https://example.com/blog/Post?id=1` → `example.com-blog-post-1a2b3c4d.png`.
 *
 * Only `[a-z0-9.-]` survives, the name never starts with a dot, and a short
 * hash of the whole URL keeps two pages of the same site apart.
 */
export function fileNameFor(url: string, extension: string): string {
  let readable = url;
  try {
    const parsed = new URL(url);
    readable = `${parsed.hostname}${parsed.pathname}`;
  } catch {
    // Not a URL: the server will say so; the name only has to be safe.
  }
  const slug = readable
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
    .replace(/[-.]+$/g, '');
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 8);
  return `${slug === '' ? 'page' : slug}-${hash}.${extension.replace(/[^a-z0-9]/g, '')}`;
}

/** Joins `name` to `directory`, refusing anything that would land outside of it. */
export function resolveInside(directory: string, name: string): string {
  const root = resolve(directory);
  const target = resolve(root, name);
  const path = relative(root, target);
  if (path === '' || path.startsWith('..') || isAbsolute(path) || path.includes(sep)) {
    throw new Error(`Refusing to write outside of ${root}`);
  }
  return target;
}
