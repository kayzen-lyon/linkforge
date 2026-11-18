/**
 * Application factory.
 *
 * Builds a fully wired Fastify instance without binding a port, so tests can
 * drive it with `app.inject()` and `server.ts` stays a thin bootstrap.
 *
 * Keep this file's name: Vercel treats a compiled `app.js`, `index.js` or
 * `server.js` as the function entry point, and only `server.ts` must match.
 */
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { LogController, type FastifyError, type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';

import type { AppConfig } from './config.js';
import { CircuitBreaker } from './lib/circuit-breaker.js';
import { AppError, ErrorCode, type ErrorBody } from './lib/errors.js';
import { Metrics } from './lib/metrics.js';
import { McpServer } from './mcp/server.js';
import { McpToolbox } from './mcp/tools.js';
import { API_VERSION, buildOpenApiDocument } from './openapi.js';
import { contentDoc, contentRoutes } from './routes/content.js';
import { extractDoc, extractRoutes } from './routes/extract.js';
import { healthDoc, healthRoutes } from './routes/health.js';
import { insightsDoc, insightsRoutes } from './routes/insights.js';
import { mcpDoc, mcpRoutes } from './routes/mcp.js';
import { metaBatchDoc, metaDoc, metaRoutes } from './routes/meta.js';
import { metricsDoc, metricsRoutes } from './routes/metrics.js';
import { openApiDoc, openApiRoutes } from './routes/openapi.js';
import {
  faviconDoc,
  oembedDoc,
  pageToolsRoutes,
  qrDoc,
  tablesDoc,
} from './routes/page-tools.js';
import { pdfDoc, pdfRoutes } from './routes/pdf.js';
import { playgroundRoutes } from './routes/playground.js';
import { screenshotDoc, screenshotRoutes } from './routes/screenshot.js';
import { animationDoc, ogDoc, paletteDoc, visualRoutes } from './routes/visual.js';
import {
  checkDoc,
  htmlDoc,
  imageDoc,
  linksDoc,
  sitemapDoc,
  siteToolsRoutes,
  techDoc,
} from './routes/site-tools.js';
import { ApiKeyRegistry } from './security/api-keys.js';
import { EgressProxy } from './security/egress-proxy.js';
import {
  installRequestIdentity,
  rateLimitBucket,
  requestIdOf,
} from './security/request-identity.js';
import { AnimationService } from './services/animation-service.js';
import { BrowserPool } from './services/browser-pool.js';
import { createCache } from './services/cache/index.js';
import { ContentService } from './services/content-service.js';
import { ExtractService } from './services/extract-service.js';
import { SafeFetcher } from './services/fetcher.js';
import { MetaService } from './services/meta-service.js';
import { OgService } from './services/og-service.js';
import { PageLoader } from './services/page-loader.js';
import { PaletteService } from './services/palette-service.js';
import { PageToolsService } from './services/page-tools-service.js';
import { PdfService } from './services/pdf-service.js';
import { Renderer } from './services/renderer.js';
import { ScreenshotService } from './services/screenshot-service.js';
import { InsightsService } from './services/insights-service.js';
import { SiteToolsService } from './services/site-tools-service.js';
import { TechService } from './services/tech-service.js';

/** Seams for tests only. Nothing here is reachable from the environment. */
export interface AppSeams {
  /**
   * Extra certificate authority (PEM) trusted by the raw HTTP fetcher, so a
   * test can serve https from a locally generated CA. Verification itself is
   * never relaxed.
   */
  readonly tlsCa?: string;
  /** Where log lines are written instead of stdout, so a test can read them. */
  readonly logStream?: { write(line: string): void };
}

/**
 * Creates the HTTP application and its services.
 *
 * Resources (browser, cache connection, sockets) are released by `app.close()`.
 */
export async function buildApp(config: AppConfig, seams: AppSeams = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel, ...(seams.logStream !== undefined && { stream: seams.logStream }) },
    // The default per-request lines carry the client address and the raw URL.
    // One structured line per request is written below instead, without either.
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: config.trustProxy,
    genReqId: requestIdOf,
    // Query-string booleans/integers arrive as strings: let Ajv coerce them.
    // Unknown parameters are dropped, not refused: a public URL routinely picks
    // up tracking or share parameters (`utm_source`, `fbclid`), and answering
    // 400 for those would break every link pasted from elsewhere.
    ajv: { customOptions: { coerceTypes: true, useDefaults: true, removeAdditional: true } },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // --- Services (manual dependency injection) --------------------------------
  const cache = createCache(config, app.log);
  // The browser's only route to the network (started with the first launch).
  const egress = new EgressProxy(config.ssrf);
  const pool = new BrowserPool(config.browser, app.log, egress);
  // One breaker for both paths: a host that times out over HTTP is not rendered either.
  const breaker = new CircuitBreaker(config.circuitBreaker.threshold, config.circuitBreaker.cooldownMs);
  const fetcher = new SafeFetcher(config, {
    breaker,
    ...(seams.tlsCa !== undefined && { ca: seams.tlsCa }),
  });
  const renderer = new Renderer(pool, config, egress, breaker);
  const metaService = new MetaService(config, cache, fetcher, renderer);
  const screenshotService = new ScreenshotService(config, cache, renderer);
  const pdfService = new PdfService(config, cache, renderer);
  const pageLoader = new PageLoader(config, fetcher, renderer);
  const extractService = new ExtractService(config, cache, pageLoader);
  const contentService = new ContentService(config, cache, pageLoader);
  const siteTools = new SiteToolsService(config, cache, fetcher, pageLoader);
  const pageTools = new PageToolsService(config, cache, fetcher, pageLoader);
  const ogService = new OgService(config, cache, renderer);
  const paletteService = new PaletteService(config, cache, fetcher, renderer);
  const animationService = new AnimationService(config, cache, renderer);
  const techService = new TechService(config, cache, fetcher, renderer);
  const insightsService = new InsightsService(config, cache, renderer);
  const apiKeys = new ApiKeyRegistry(config.apiKeys);
  const metrics = new Metrics();
  metrics.gauge({ name: 'omnillink_browser_jobs_active', help: 'Rendering jobs in progress.', read: () => pool.stats().active });
  metrics.gauge({ name: 'omnillink_browser_jobs_queued', help: 'Rendering jobs waiting for a slot.', read: () => pool.stats().queued });
  metrics.gauge({ name: 'omnillink_circuit_open_hosts', help: 'Target hosts currently short-circuited.', read: () => breaker.openCount() });
  metrics.gauge({ name: 'omnillink_circuit_opened_total', help: 'Times a circuit has opened since boot.', read: () => breaker.openedTotal });
  metrics.gauge({ name: 'omnillink_process_resident_memory_bytes', help: 'Resident memory of the process.', read: () => process.memoryUsage().rss });
  metrics.gauge({ name: 'omnillink_process_uptime_seconds', help: 'Seconds since the process started.', read: () => Math.round(process.uptime()) });

  // Shared rate-limit counters when Redis is configured; in memory otherwise.
  // A dedicated connection: the limiter must fail fast and never queue behind cache traffic.
  const rateLimitRedis =
    config.redisUrl === null
      ? null
      : new Redis(config.redisUrl, { connectTimeout: 1000, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  rateLimitRedis?.on('error', (error: Error) => app.log.warn({ err: error }, 'rate-limit redis connection error'));

  app.addHook('onClose', async () => {
    rateLimitRedis?.disconnect();
    await Promise.allSettled([pool.close(), fetcher.close(), cache.close()]);
    // After the browser: its connections end with it.
    await egress.close();
  });

  // --- Cross-cutting plugins --------------------------------------------------
  // Before the rate limiter: its bucket depends on the resolved API key.
  installRequestIdentity(app, apiKeys);
  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    // Without this, browser code cannot read our custom response headers.
    exposedHeaders: [
      'x-animation-frames',
      'x-qr-version',
      'x-request-id',
      'x-cache',
      'x-render-source',
      'x-final-url',
      'etag',
      'retry-after',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
    ],
    methods: ['GET', 'HEAD', 'POST'],
  });
  await app.register(rateLimit, {
    ...(rateLimitRedis !== null && {
      redis: rateLimitRedis,
      nameSpace: 'linkforge:v1:ratelimit:',
      // The limiter is a protection, not a dependency: if Redis is down, requests pass.
      skipOnError: true,
    }),
    max: (request) => (request.apiKeyId === null ? config.rateLimit.max : config.rateLimit.keyMax),
    keyGenerator: rateLimitBucket,
    timeWindow: config.rateLimit.windowMs,
    errorResponseBuilder: (_request, context) => {
      // Thrown by the plugin and funnelled through the error handler below.
      return new AppError(
        ErrorCode.RateLimited,
        context.statusCode,
        `Rate limit exceeded, retry in ${context.after}`,
      );
    },
  });

  // --- Observability --------------------------------------------------------------
  // One line per request: route pattern, status, timing, cache verdict and the
  // target's host. No client address, no query string, no key: nothing personal.
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    const cacheHeader = reply.getHeader('x-cache');
    const cacheResult = cacheHeader === 'HIT' ? 'hit' : cacheHeader === 'MISS' ? 'miss' : null;
    metrics.observe(route, request.method, reply.statusCode, reply.elapsedTime / 1000, cacheResult);
    let targetHost: string | undefined;
    const target = (request.query as { url?: unknown } | null)?.url;
    if (typeof target === 'string') {
      try {
        targetHost = new URL(target).host;
      } catch {
        // Not a URL: nothing worth logging.
      }
    }
    request.log.info(
      {
        route,
        method: request.method,
        status: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
        ...(cacheResult !== null && { cache: cacheResult }),
        ...(typeof reply.getHeader('x-render-source') === 'string' && { source: reply.getHeader('x-render-source') }),
        ...(targetHost !== undefined && { targetHost }),
        keyed: request.apiKeyId !== null,
      },
      'request completed',
    );
  });

  // --- Error handling -----------------------------------------------------------
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.warn({ err: error }, error.message);
      const body: ErrorBody = {
        status: error.statusCode >= 500 ? 'error' : 'fail',
        code: error.code,
        message: error.message,
      };
      // The wait is also in the message, but only a header is machine-readable.
      if (error.retryAfterSeconds !== undefined) {
        void reply.header('retry-after', String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
      }
      return reply.status(error.statusCode).send(body);
    }

    if (error.validation !== undefined) {
      const body: ErrorBody = {
        status: 'fail',
        code: ErrorCode.InvalidParams,
        message: error.message,
      };
      return reply.status(400).send(body);
    }

    // Framework errors that already carry a client status (malformed request, 415...).
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      const body: ErrorBody = {
        status: 'fail',
        code: ErrorCode.InvalidParams,
        message: error.message,
      };
      return reply.status(error.statusCode).send(body);
    }

    // Unknown failure: log everything, disclose nothing.
    request.log.error({ err: error }, 'unhandled error');
    const body: ErrorBody = {
      status: 'error',
      code: ErrorCode.Internal,
      message: 'Internal server error',
    };
    return reply.status(500).send(body);
  });

  // Its own code: `EINVALIDPARAMS` is documented as a 400 about parameters,
  // and a client switching on the code must not take a wrong path for one.
  app.setNotFoundHandler((request, reply) => {
    const body: ErrorBody = {
      status: 'fail',
      code: ErrorCode.RouteNotFound,
      message: `Route ${request.method} ${request.url.split('?')[0]} not found`,
    };
    return reply.status(404).send(body);
  });

  // --- Routes -------------------------------------------------------------------
  await app.register(healthRoutes, { pool, cache, rateLimitStore: rateLimitRedis === null ? 'memory' : 'redis' });
  if (config.metricsToken !== null) await app.register(metricsRoutes, { metrics, token: config.metricsToken });
  await app.register(playgroundRoutes);
  if (config.mcpEnabled) {
    const toolbox = new McpToolbox({
      metaService,
      contentService,
      extractService,
      siteTools,
      techService,
      screenshotService,
    });
    await app.register(mcpRoutes, {
      server: new McpServer(toolbox, { name: 'omnillink', version: API_VERSION }, (error) =>
        app.log.error({ err: error }, 'mcp tool failed'),
      ),
      allowedOrigins: config.corsOrigin,
    });
  }
  await app.register(
    async (v1) => {
      await v1.register(metaRoutes, {
        metaService,
        // A batch is up to ten lookups: it gets a tenth of the caller's quota.
        batchRateLimit: {
          max: Math.max(1, Math.floor(config.rateLimit.max / 10)),
          keyMax: Math.max(1, Math.floor(config.rateLimit.keyMax / 10)),
        },
      });
      await v1.register(screenshotRoutes, { screenshotService });
      await v1.register(pdfRoutes, { pdfService });
      await v1.register(extractRoutes, { extractService });
      await v1.register(contentRoutes, { contentService });
      await v1.register(siteToolsRoutes, { siteTools, techService });
      await v1.register(insightsRoutes, { insightsService });
      await v1.register(pageToolsRoutes, { pageTools });
      await v1.register(visualRoutes, { ogService, paletteService, animationService });
      await v1.register(openApiRoutes, {
        document: buildOpenApiDocument([
          metaDoc,
          metaBatchDoc,
          screenshotDoc,
          pdfDoc,
          animationDoc,
          extractDoc,
          contentDoc,
          tablesDoc,
          linksDoc,
          htmlDoc,
          techDoc,
          insightsDoc,
          faviconDoc,
          oembedDoc,
          paletteDoc,
          qrDoc,
          ogDoc,
          imageDoc,
          sitemapDoc,
          checkDoc,
          ...(config.mcpEnabled ? [mcpDoc] : []),
          openApiDoc,
          healthDoc,
          ...(config.metricsToken !== null ? [metricsDoc] : []),
        ]),
      });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
