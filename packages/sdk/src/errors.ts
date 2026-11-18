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
  | 'EBUSY'
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
 * - `EHTTP`: an HTTP error whose body is not a LinkForge error (a proxy page, for example).
 * - `EBADRESPONSE`: a successful status with a body that is not what the API documents.
 */
export type ClientErrorCode = 'ENETWORK' | 'ETIMEOUT' | 'EABORTED' | 'EHTTP' | 'EBADRESPONSE';

/** Known codes, open to the ones a newer server may add. */
export type LinkForgeErrorCode = ApiErrorCode | ClientErrorCode | (string & {});

export interface LinkForgeErrorInit {
  readonly code: LinkForgeErrorCode;
  /** HTTP status, or `0` when no response was received. */
  readonly status: number;
  readonly message: string;
  readonly cause?: unknown;
  /** Seconds from the `Retry-After` header, when the server sent one. */
  readonly retryAfter?: number;
}

const RETRYABLE: ReadonlySet<string> = new Set([
  'ERATELIMIT',
  'EBUSY',
  'ETIMEOUT',
  'ENETWORK',
  'EUNREACHABLE',
]);

/** The one error every method of the client throws. */
export class LinkForgeError extends Error {
  override readonly name = 'LinkForgeError';
  readonly code: LinkForgeErrorCode;
  /** HTTP status, or `0` when no response was received. */
  readonly status: number;
  /** Seconds to wait before retrying, when the server said so. */
  readonly retryAfter: number | undefined;

  constructor(init: LinkForgeErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.code = init.code;
    this.status = init.status;
    this.retryAfter = init.retryAfter;
  }

  /** True when trying again later can reasonably succeed. */
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/** Type guard that also works across realms and duplicated copies of the package. */
export function isLinkForgeError(value: unknown): value is LinkForgeError {
  return (
    value instanceof LinkForgeError ||
    (value instanceof Error && value.name === 'LinkForgeError' && 'code' in value && 'status' in value)
  );
}
