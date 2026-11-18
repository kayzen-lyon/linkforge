/**
 * Process entry point: load configuration, start listening, shut down cleanly.
 */
// Imported here on purpose: Vercel recognises the entry point of a Fastify
// service by its direct `fastify` import.
import type { FastifyInstance } from 'fastify';

import { buildApp } from './create-app.js';
import { ConfigError, loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app: FastifyInstance = await buildApp(config);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    // Stops accepting connections, drains in-flight requests, then closes Chromium/Redis.
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'error during shutdown');
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(`Invalid configuration: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
