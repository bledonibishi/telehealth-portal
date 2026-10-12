import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ERRORS, ErrorCode, ErrorSeverity } from '@telehealth/shared-types';

export { ErrorCode } from '@telehealth/shared-types';

export interface AppErrorOptions {
  /** Per-input messages, keyed by the input's name, so a form can show each next to its field. */
  fields?: Record<string, string>;
  /** Overrides the code's usual severity, e.g. a refusal that is a "not yet" rather than a mistake. */
  severity?: ErrorSeverity;
  /** Why a session ended (AuthFailureReason). */
  reason?: string;
}

// Nest's own class for each status, so `instanceof UnauthorizedException` and friends keep working.
const EXCEPTIONS: Record<number, new (body: object) => HttpException> = {
  400: BadRequestException,
  401: UnauthorizedException,
  403: ForbiddenException,
  404: NotFoundException,
  409: ConflictException,
  413: PayloadTooLargeException,
  500: InternalServerErrorException,
  503: ServiceUnavailableException,
};

/**
 * The error to throw when the apps should be able to tell it apart, or it should show as a warning. Its code comes
 * from the shared catalog (`@telehealth/shared-types` errors.ts), which also gives the status, severity and a
 * default message.
 *
 *   throw appError(ErrorCode.INVALID_CREDENTIALS);
 *   throw appError(ErrorCode.CONFLICT, 'This order has already shipped');
 *   throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { email: 'Please enter a valid email' } });
 *
 * Nest's exceptions (`new BadRequestException('…')`) still work: they get the code for their status and their
 * message is shown as it is, so write it for the person reading it.
 */
export function appError(code: ErrorCode, message?: string, options: AppErrorOptions = {}): HttpException {
  const definition = ERRORS[code];
  const body = {
    statusCode: definition.status,
    code,
    severity: options.severity ?? definition.severity,
    message: message ?? definition.message,
    ...(options.reason && { reason: options.reason }),
    ...(options.fields && { fields: options.fields }),
  };
  const Exception = EXCEPTIONS[definition.status];
  return Exception ? new Exception(body) : new HttpException(body, definition.status);
}

/** A refusal that is not a mistake: it can't happen yet, or was already done. The apps show it in amber, not red. */
export const warning = (message: string, code: ErrorCode = ErrorCode.BAD_REQUEST) => appError(code, message, { severity: 'warning' });
