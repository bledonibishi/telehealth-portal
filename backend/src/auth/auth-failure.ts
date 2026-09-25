import { UnauthorizedException } from '@nestjs/common';

export enum AuthFailureReason {
  TOKEN_MISSING = 'TOKEN_MISSING',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  WRONG_TOKEN_TYPE = 'WRONG_TOKEN_TYPE',
  MFA_REQUIRED = 'MFA_REQUIRED',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  UNKNOWN_ROLE = 'UNKNOWN_ROLE',
}

const MESSAGES: Record<AuthFailureReason, string> = {
  [AuthFailureReason.TOKEN_MISSING]: 'No access token provided',
  [AuthFailureReason.TOKEN_EXPIRED]: 'Access token expired',
  [AuthFailureReason.TOKEN_INVALID]: 'Access token invalid',
  [AuthFailureReason.WRONG_TOKEN_TYPE]: 'Token cannot be used for this request',
  [AuthFailureReason.MFA_REQUIRED]: 'MFA verification required',
  [AuthFailureReason.ACCOUNT_NOT_FOUND]: 'Account no longer exists',
  [AuthFailureReason.UNKNOWN_ROLE]: 'Token has an unknown role',
};

export function authFailure(reason: AuthFailureReason) {
  return new UnauthorizedException({ statusCode: 401, message: MESSAGES[reason], reason });
}

export function authFailureReason(exception: UnauthorizedException): string {
  const response = exception.getResponse();
  return (typeof response === 'object' && (response as { reason?: string }).reason) || 'UNKNOWN';
}
