/**
 * GET /api/preview?url=… — a thin proxy in front of Omnillink.
 *
 * Why a proxy: the API key stays on the server, and the browser only ever
 * talks to your own origin.
 */
import { createClient, OmnillinkError } from '@omnillink/sdk';

const omnillink = createClient({
  baseUrl: process.env.OMNILLINK_URL ?? 'https://linkforge-sable.vercel.app',
  // Only sent when it is set; never exposed to the browser (no NEXT_PUBLIC_ prefix).
  ...(process.env.OMNILLINK_API_KEY ? { apiKey: process.env.OMNILLINK_API_KEY } : {}),
});

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get('url');
  if (url === null || url === '') {
    return Response.json({ code: 'EINVALIDURL', message: 'Missing "url" query parameter' }, { status: 400 });
  }

  try {
    const { data } = await omnillink.meta(url, { signal: request.signal });
    return Response.json(data, { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } });
  } catch (error) {
    if (error instanceof OmnillinkError) {
      // `status` is 0 when Omnillink itself could not be reached.
      const status = error.status >= 400 ? error.status : 502;
      return Response.json({ code: error.code, message: error.message }, { status });
    }
    throw error;
  }
}
