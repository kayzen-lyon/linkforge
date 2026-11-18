import { createClient, OmnillinkError } from '@omnillink/sdk';

import { LinkCard, LinkTitle } from './components/link-card';

const baseUrl = process.env.OMNILLINK_URL ?? 'https://omnillink.kayzen-lyon.com';
const url = 'https://github.com';

/** A Server Component: the metadata is fetched on the server and ships as HTML. */
async function ServerRenderedTitle() {
  try {
    const { data } = await createClient({ baseUrl }).meta(url);
    return (
      <p>
        <strong>{data.title}</strong> — {data.description}
      </p>
    );
  } catch (error) {
    if (error instanceof OmnillinkError) return <p>No metadata ({error.code}).</p>;
    throw error;
  }
}

export default function Page() {
  return (
    <main style={{ maxWidth: '40rem', margin: '3rem auto', fontFamily: 'system-ui' }}>
      <h1>Omnillink + Next.js</h1>

      <h2>On the server</h2>
      <ServerRenderedTitle />

      <h2>In the browser</h2>
      <LinkCard url={url} baseUrl={baseUrl} />
      <p>
        With the hook: <LinkTitle url={url} baseUrl={baseUrl} />
      </p>

      <h2>Through your own route</h2>
      <p>
        <a href={`/api/preview?url=${encodeURIComponent(url)}`}>/api/preview?url=…</a> keeps the API key on the server.
      </p>
    </main>
  );
}
