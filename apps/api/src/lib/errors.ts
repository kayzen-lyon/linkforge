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
  /** The target answered with an anti-bot challenge or an access-denied page instead of its content. */
  Blocked: 'EBLOCKED',
  /** Too many rendering jobs are queued; the client should retry later. */
  Busy: 'EBUSY',
  /** The target host failed repeatedly and is short-circuited for a moment. */
  CircuitOpen: 'ECIRCUITOPEN',
  /** Rate limit exceeded. */
  RateLimited: 'ERATELIMIT',
  /** An `x-api-key` header was sent but matches no configured key. */
  Unauthorized: 'EUNAUTHORIZED',
  /** The item asked for (embed path, preview image, oEmbed endpoint, icon, table) is absent for this URL. */
  EmbedNotFound: 'EEMBEDNOTFOUND',
  /** `/screenshot?selector=`: no visible element matches the selector. */
  SelectorNotFound: 'ESELECTORNOTFOUND',
  /** The target is not an HTML document, which this endpoint requires. */
  NotHtml: 'ENOTHTML',
  /** The generated output exceeds the configured size limit. */
  TooLarge: 'ETOOLARGE',
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

  static invalidParams(message: string): AppError {
    return new AppError(ErrorCode.InvalidParams, 400, message);
  }

  static unauthorized(message: string): AppError {
    return new AppError(ErrorCode.Unauthorized, 401, message);
  }

  static embedNotFound(message: string): AppError {
    return new AppError(ErrorCode.EmbedNotFound, 404, message);
  }

  static selectorNotFound(message: string): AppError {
    return new AppError(ErrorCode.SelectorNotFound, 404, message);
  }

  static notHtml(contentType: string | null): AppError {
    return new AppError(
      ErrorCode.NotHtml,
      422,
      `The target is not an HTML document (${contentType ?? 'unknown content type'})`,
    );
  }

  static tooLarge(message: string): AppError {
    return new AppError(ErrorCode.TooLarge, 422, message);
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

  static blocked(reason: string): AppError {
    return new AppError(
      ErrorCode.Blocked,
      502,
      `The target answered with a block page instead of its content (${reason})`,
    );
  }

  static busy(message: string): AppError {
    return new AppError(ErrorCode.Busy, 503, message);
  }

  static circuitOpen(host: string, retryAfterSeconds: number): AppError {
    return new AppError(
      ErrorCode.CircuitOpen,
      503,
      `${host} failed repeatedly and is not contacted for now, retry in ${retryAfterSeconds} s`,
    );
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
