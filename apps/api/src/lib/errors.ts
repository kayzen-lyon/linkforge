/**
 * Domain errors.
 *
 * Every failure the API can report is an {@link AppError} carrying a stable
 * machine-readable `code` and the HTTP status to answer with. Anything that is
 * not an `AppError` is treated as an unexpected bug and reported as a 500
 * without leaking internals.
 */

export const ErrorCode = {
  /** The `url` parameter is missing, malformed or uses an unsupported scheme. */
  InvalidUrl: 'EINVALIDURL',
  /** The destination is refused by the anti-SSRF policy. */
  ForbiddenUrl: 'EFORBIDDENURL',
  /** Query parameters failed schema validation. */
  InvalidParams: 'EINVALIDPARAMS',
  /** The target did not answer within the allotted time. */
  Timeout: 'ETIMEOUT',
  /** The target is unreachable (DNS failure, refused connection, TLS error...). */
  Unreachable: 'EUNREACHABLE',
  /** The target answered with an HTTP error status. */
  TargetStatus: 'ETARGETSTATUS',
  /** Too many rendering jobs are queued; the client should retry later. */
  Busy: 'EBUSY',
  /** Rate limit exceeded. */
  RateLimited: 'ERATELIMIT',
  /** The headless browser crashed or could not be started. */
  Browser: 'EBROWSER',
  /** Unexpected server-side failure. */
  Internal: 'EINTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }

  static invalidUrl(message: string): AppError {
    return new AppError(ErrorCode.InvalidUrl, 400, message);
  }

  static forbiddenUrl(message: string): AppError {
    return new AppError(ErrorCode.ForbiddenUrl, 403, message);
  }

  static timeout(message: string, cause?: unknown): AppError {
    return new AppError(ErrorCode.Timeout, 504, message, { cause });
  }

  static unreachable(message: string, cause?: unknown): AppError {
    return new AppError(ErrorCode.Unreachable, 502, message, { cause });
  }

  static targetStatus(status: number): AppError {
    return new AppError(ErrorCode.TargetStatus, 502, `The target responded with HTTP ${status}`);
  }

  static busy(message: string): AppError {
    return new AppError(ErrorCode.Busy, 503, message);
  }

  static browser(message: string, cause?: unknown): AppError {
    return new AppError(ErrorCode.Browser, 500, message, { cause });
  }
}

/** Shape of every error body returned by the API. */
export interface ErrorBody {
  status: 'fail' | 'error';
  code: ErrorCode;
  message: string;
}

/**
 * Walks an error's `cause` chain looking for a Node-style `code` property
 * (`ENOTFOUND`, `ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT`...).
 */
export function findErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== 'object' || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === 'string') return record.code;
  return findErrorCode(record.cause, depth + 1);
}

/** Finds an {@link AppError} anywhere in an error's `cause` chain. */
export function findAppError(error: unknown, depth = 0): AppError | undefined {
  if (error instanceof AppError) return error;
  if (depth > 5 || typeof error !== 'object' || error === null) return undefined;
  return findAppError((error as { cause?: unknown }).cause, depth + 1);
}
