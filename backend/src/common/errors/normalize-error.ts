import { HttpException } from '@nestjs/common';
import { ApiErrorPayload, ERRORS, ErrorCode, errorCodeForStatus, isErrorCode } from '@telehealth/shared-types';

export interface NormalizedError extends ApiErrorPayload {
  status: number;
  /** Not one we threw on purpose: a bug or an outage, which is logged and never shown as it is. */
  unexpected: boolean;
}

// The text Nest and its libraries use when an exception is thrown without a message. It says nothing a person can
// act on, so the catalog's message for the status is shown instead.
const DEFAULT_MESSAGES = new Set([
  'Bad Request', 'Unauthorized', 'Forbidden', 'Forbidden resource', 'Not Found', 'Conflict', 'Payload Too Large',
  'Too Many Requests', 'ThrottlerException: Too Many Requests', 'Internal Server Error', 'Service Unavailable',
  'Bad Request Exception', 'Unauthorized Exception', 'Forbidden Exception', 'Not Found Exception', 'Conflict Exception',
]);

// Prisma's known request errors that are the caller's doing rather than ours.
const PRISMA_CODES: Record<string, ErrorCode> = {
  P2002: ErrorCode.CONFLICT, // unique constraint
  P2025: ErrorCode.NOT_FOUND, // record to update or delete does not exist
};

const fromCode = (code: ErrorCode, message?: string, unexpected = false): NormalizedError => {
  const definition = ERRORS[code];
  return { code, status: definition.status, severity: definition.severity, message: message || definition.message, unexpected };
};

/** Turns anything a request can throw into what the API sends back. Unknown errors get the generic message. */
export function normalizeError(exception: unknown): NormalizedError {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const body: Record<string, any> = typeof response === 'object' && response !== null ? response : { message: response };

    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const code: ErrorCode = isErrorCode(body.code) ? body.code : reason ? ErrorCode.SESSION_ENDED : errorCodeForStatus(status);
    const definition = ERRORS[code];

    // class-validator answers with a list of messages
    const raw = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    const message = status >= 500 || typeof raw !== 'string' || !raw || DEFAULT_MESSAGES.has(raw) ? definition.message : raw;

    return {
      code,
      status,
      severity: body.severity === 'warning' || body.severity === 'error' ? body.severity : definition.severity,
      message,
      unexpected: status >= 500,
      ...(reason && { reason }),
      ...(body.fields && { fields: body.fields }),
    };
  }

  const prismaCode = (exception as { code?: unknown; name?: string })?.name === 'PrismaClientKnownRequestError'
    ? PRISMA_CODES[(exception as { code: string }).code]
    : undefined;
  if (prismaCode) return fromCode(prismaCode);

  return fromCode(ErrorCode.INTERNAL, undefined, true);
}
