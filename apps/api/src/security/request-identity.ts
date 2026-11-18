/**
 * Per-request identity: correlation id and API key.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { AppError } from '../lib/errors.js';
import type { ApiKeyRegistry } from './api-keys.js';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Identifier of the verified API key (never the key itself), `null` for an
     * anonymous request. Set before rate limiting runs.
     */
    apiKeyId: string | null;
    /** True when an `x-api-key` was sent but matches no configured key. */
    apiKeyRejected: boolean;
  }
}

/** What we accept to echo back from a client-supplied `x-request-id`. */
const REQUEST_ID = /^[\w.:-]{1,128}$/;

/**
 * Picks the id of a request: the client's `x-request-id` when it is
 * well-formed (so a caller can correlate its own logs with ours), a fresh
 * UUID otherwise. The value ends up in logs and in a response header, hence
 * the strict syntax.
 */
export function requestIdOf(request: IncomingMessage): string {
  const supplied = request.headers['x-request-id'];
  return typeof supplied === 'string' && REQUEST_ID.test(supplied) ? supplied : randomUUID();
}

/**
 * Installs the hooks that stamp every response with `x-request-id` and
 * resolve the caller's API key.
 *
 * The key is *resolved* in `onRequest` but an unknown key is only *refused*
 * in `preValidation`, on purpose: the rate limiter runs in between, so
 * guesses at a key are counted against the caller's IP like any anonymous
 * request instead of being free.
 *
 * Must be called on the root instance, before routes are registered.
 */
export function installRequestIdentity(app: FastifyInstance, apiKeys: ApiKeyRegistry): void {
  app.decorateRequest('apiKeyId', null);
  app.decorateRequest('apiKeyRejected', false);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);

    if (!apiKeys.enabled) return;
    const presented = request.headers['x-api-key'];
    if (presented === undefined) return;
    const id = typeof presented === 'string' ? apiKeys.identify(presented) : null;
    request.apiKeyId = id;
    request.apiKeyRejected = id === null;
  });

  app.addHook('preValidation', async (request) => {
    if (request.apiKeyRejected) throw AppError.unauthorized('Unknown API key');
  });
}

/** Rate-limit bucket of a request: its API key when it has one, its IP otherwise. */
export function rateLimitBucket(request: FastifyRequest): string {
  return request.apiKeyId ?? `ip:${request.ip}`;
}
