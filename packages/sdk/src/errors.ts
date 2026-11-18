/** Codes the API answers with. */
export type ApiErrorCode =
  | 'EINVALIDPARAMS'
  | 'EINVALIDURL'
  | 'EFORBIDDENURL'
  | 'EUNAUTHORIZED'
  | 'EEMBEDNOTFOUND'
  | 'ESELECTORNOTFOUND'
  | 'ENOTHTML'
  | 'ETOOLARGE'
  | 'ERATELIMIT'
  | 'EUNREACHABLE'
  | 'ETARGETSTATUS'
  | 'EBLOCKED'
  | 'EBUSY'
  | 'ECIRCUITOPEN'
  | 'ETIMEOUT'
  | 'EBROWSER'
  | 'EINTERNAL';

/**
 * Codes produced by the client itself, always with `status: 0` except `EHTTP`
 * and `EBADRESPONSE`, which carry the HTTP status they were read from.
 *
 * - `ENETWORK`: the request never got an answer (DNS, connection, CORS...).
 * - `ETIMEOUT`: the client's `timeoutMs` elapsed (shared with the server-side code).
 * - `EABORTED`: the caller's `signal` aborted the request.
 * - `EHTTP`: an HTTP error whose body is not an Omnillink error (a proxy page, for example).
 * - `EBADRESPONSE`: a successful status with a body that is not what the API documents.
 */
export type ClientErrorCode = 'ENETWORK' | 'ETIMEOUT' | 'EABORTED' | 'EHTTP' | 'EBADRESPONSE';

/** Known codes, open to the ones a newer server may add. */
export type OmnillinkErrorCode = ApiErrorCode | ClientErrorCode | (string & {});

export interface OmnillinkErrorInit {
  readonly code: OmnillinkErrorCode;
  /** HTTP status, or `0` when no response was received. */
  readonly status: number;
  readonly message: string;
  readonly cause?: unknown;
  /** Seconds from the `Retry-After` header, when the server sent one. */
  readonly retryAfter?: number;
  /** `x-request-id` of the failed response, when there was one. */
  readonly requestId?: string;
}

/**
 * Codes for which the same request can reasonably succeed later:
 *
 * - `ERATELIMIT`: the quota window resets (`retryAfter` says when).
 * - `EBUSY`: the rendering pool was full; a slot frees up within seconds.
 * - `ECIRCUITOPEN`: the target host is short-circuited for a moment (30 s by
 *   default) after repeated failures, then tried again.
 * - `ETIMEOUT`, `ENETWORK`, `EUNREACHABLE`: transient by nature.
 *
 * `EBLOCKED` is deliberately absent: the target served an anti-bot page after
 * a browser retry on the server side already; asking again gets the same wall.
 */
const RETRYABLE: ReadonlySet<string> = new Set([
  'ERATELIMIT',
  'EBUSY',
  'ECIRCUITOPEN',
  'ETIMEOUT',
  'ENETWORK',
  'EUNREACHABLE',
]);

/** The one error every method of the client throws. */
export class OmnillinkError extends Error {
  override readonly name = 'OmnillinkError';
  readonly code: OmnillinkErrorCode;
  /** HTTP status, or `0` when no response was received. */
  readonly status: number;
  /** Seconds to wait before retrying, when the server said so. */
  readonly retryAfter: number | undefined;
  /** `x-request-id` of the failed response: quote it when reporting a problem. */
  readonly requestId: string | undefined;

  constructor(init: OmnillinkErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.code = init.code;
    this.status = init.status;
    this.retryAfter = init.retryAfter;
    this.requestId = init.requestId;
  }

  /** True when trying again later can reasonably succeed. */
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/** Type guard that also works across realms and duplicated copies of the package. */
export function isOmnillinkError(value: unknown): value is OmnillinkError {
  return (
    value instanceof OmnillinkError ||
    (value instanceof Error && value.name === 'OmnillinkError' && 'code' in value && 'status' in value)
  );
}
