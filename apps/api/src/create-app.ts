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
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';

import type { AppConfig } from './config.js';
import { CircuitBreaker } from './lib/circuit-breaker.js';
import { AppError, ErrorCode, type ErrorBody } from './lib/errors.js';
import { buildOpenApiDocument } from './openapi.js';
import { contentDoc, contentRoutes } from './routes/content.js';
import { extractDoc, extractRoutes } from './routes/extract.js';
import { healthDoc, healthRoutes } from './routes/health.js';
import { insightsDoc, insightsRoutes } from './routes/insights.js';
import { metaBatchDoc, metaDoc, metaRoutes } from './routes/meta.js';
import { openApiDoc, openApiRoutes } from './routes/openapi.js';
import { pdfDoc, pdfRoutes } from './routes/pdf.js';
import { playgroundRoutes } from './routes/playground.js';
import { screenshotDoc, screenshotRoutes } from './routes/screenshot.js';
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
import { BrowserPool } from './services/browser-pool.js';
import { createCache } from './services/cache/index.js';
import { ContentService } from './services/content-service.js';
import { ExtractService } from './services/extract-service.js';
import { SafeFetcher } from './services/fetcher.js';
import { MetaService } from './services/meta-service.js';
import { PageLoader } from './services/page-loader.js';
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
}

/**
 * Creates the HTTP application and its services.
 *
 * Resources (browser, cache connection, sockets) are released by `app.close()`.
 */
export async function buildApp(config: AppConfig, seams: AppSeams = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
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
  const techService = new TechService(config, cache, fetcher, renderer);
  const insightsService = new InsightsService(config, cache, renderer);
  const apiKeys = new ApiKeyRegistry(config.apiKeys);

  app.addHook('onClose', async () => {
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

  // --- Error handling -----------------------------------------------------------
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.warn({ err: error }, error.message);
      const body: ErrorBody = {
        status: error.statusCode >= 500 ? 'error' : 'fail',
        code: error.code,
        message: error.message,
      };
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

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorBody = {
      status: 'fail',
      code: ErrorCode.InvalidParams,
      message: `Route ${request.method} ${request.url.split('?')[0]} not found`,
    };
    return reply.status(404).send(body);
  });

  // --- Routes -------------------------------------------------------------------
  await app.register(healthRoutes, { pool, cache });
  await app.register(playgroundRoutes);
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
      await v1.register(openApiRoutes, {
        document: buildOpenApiDocument([
          metaDoc,
          metaBatchDoc,
          screenshotDoc,
          pdfDoc,
          extractDoc,
          contentDoc,
          linksDoc,
          htmlDoc,
          techDoc,
          insightsDoc,
          imageDoc,
          sitemapDoc,
          checkDoc,
          openApiDoc,
          healthDoc,
        ]),
      });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
