'use client';

import { LinkPreview, QrCode, useLinkCheck, useLinkMeta, useTech } from '@omnillink/react';

/** The drop-in card: a plain link on the server, the `<link-preview>` element in the browser. */
export function LinkCard({ url, baseUrl }: { url: string; baseUrl: string }) {
  return <LinkPreview url={url} baseUrl={baseUrl} size="large" onError={({ error }) => console.warn('No preview', error)} />;
}

/** Your own markup around the metadata, with the hook. */
export function LinkTitle({ url, baseUrl }: { url: string; baseUrl: string }) {
  const { status, data } = useLinkMeta(url, { baseUrl });
  if (status !== 'success') return <a href={url}>{url}</a>;
  return (
    <a href={url}>
      {data.title ?? url}
      {data.publisher ? ` — ${data.publisher}` : ''}
    </a>
  );
}

/** What the site is built with, and whether the link works right now: two more hooks, same store, same abort logic. */
export function LinkFacts({ url, baseUrl }: { url: string; baseUrl: string }) {
  const tech = useTech(url, { baseUrl });
  const check = useLinkCheck(url, { baseUrl });
  return (
    <ul>
      <li>
        {check.status === 'success'
          ? `${check.data.ok ? 'Up' : 'Broken'} (HTTP ${check.data.status}, ${check.data.redirects.length - 1} redirect(s))`
          : check.status === 'error'
            ? 'Could not be checked'
            : 'Checking…'}
      </li>
      <li>
        {tech.status === 'success'
          ? tech.data.technologies.map((item) => (item.version ? `${item.name} ${item.version}` : item.name)).join(', ') || 'Nothing recognised'
          : tech.status === 'error'
            ? 'No technology report'
            : 'Detecting…'}
      </li>
    </ul>
  );
}

/** A QR code is an `<img>`: nothing to fetch from JavaScript, nothing to hydrate. */
export function LinkQr({ url, baseUrl }: { url: string; baseUrl: string }) {
  return <QrCode url={url} baseUrl={baseUrl} size={160} loading="lazy" />;
}
