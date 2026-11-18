/**
 * Vercel entry point.
 *
 * Every /api/* and /health request is rewritten to this single function (see
 * vercel.json), which hands the raw Node request to the Fastify app. The app
 * is built once per function instance and reused across invocations, so the
 * browser pool and the in-memory cache survive between requests.
 *
 * The API is compiled to apps/api/dist during the install step.
 */
import { buildApp } from '../apps/api/dist/app.js';
import { loadConfig } from '../apps/api/dist/config.js';

/** Serverless defaults; any variable set in the Vercel project overrides them. */
const SERVERLESS_DEFAULTS = {
  // Vercel's proxy sets X-Forwarded-For: needed for per-client rate limiting.
  TRUST_PROXY: 'true',
  // One function instance has limited CPU and memory: keep few pages in parallel.
  BROWSER_MAX_CONCURRENCY: '2',
  BROWSER_MAX_QUEUE: '10',
  // The serverless Chromium build runs in single-process mode and exits when
  // its last page closes, so every job gets its own short-lived browser.
  BROWSER_MAX_USES: '1',
};

let appPromise;

function getApp() {
  appPromise ??= (async () => {
    const app = await buildApp(loadConfig({ ...SERVERLESS_DEFAULTS, ...process.env }));
    await app.ready();
    return app;
  })();
  // A failed boot must not poison the instance: retry on the next request.
  appPromise.catch(() => {
    appPromise = undefined;
  });
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
