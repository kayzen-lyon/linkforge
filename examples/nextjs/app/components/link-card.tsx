'use client';

import { LinkPreview, useLinkMeta } from '@omnillink/react';

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
