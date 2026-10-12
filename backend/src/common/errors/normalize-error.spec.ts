import { BadRequestException, ForbiddenException, HttpException, HttpStatus, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { GraphQLError } from 'graphql';
import { ErrorCode } from '@telehealth/shared-types';
import { AuthFailureReason, authFailure } from '../../auth/auth-failure';
import { appError, warning } from './app-error';
import { normalizeError } from './normalize-error';
import { formatGraphQLError } from './graphql-error-formatter';

describe('normalizeError', () => {
  it('keeps a message written for people and picks the code from the status', () => {
    expect(normalizeError(new NotFoundException('Appointment not found'))).toEqual({
      code: ErrorCode.NOT_FOUND,
      status: 404,
      severity: 'error',
      message: 'Appointment not found',
      unexpected: false,
    });
  });

  it('replaces Nest’s default text with the catalog message', () => {
    expect(normalizeError(new ForbiddenException()).message).toBe('You don’t have access to this.');
    const throttled = normalizeError(new ThrottlerException());
    expect(throttled).toMatchObject({ code: ErrorCode.RATE_LIMITED, severity: 'warning', status: 429 });
    expect(throttled.message).not.toContain('Throttler');
  });

  it('carries an appError’s code, severity and fields', () => {
    const e = appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { email: 'Please enter a valid email' } });
    expect(e).toBeInstanceOf(BadRequestException);
    expect(normalizeError(e)).toMatchObject({ code: ErrorCode.VALIDATION_FAILED, status: 400, fields: { email: 'Please enter a valid email' } });
    expect(normalizeError(warning('Your identity is already verified'))).toMatchObject({ code: ErrorCode.BAD_REQUEST, severity: 'warning' });
  });

  it('keeps a 401 from appError an UnauthorizedException, so guards and filters still recognise it', () => {
    expect(appError(ErrorCode.INVALID_CREDENTIALS)).toBeInstanceOf(UnauthorizedException);
  });

  it('marks a session failure with its reason', () => {
    expect(normalizeError(authFailure(AuthFailureReason.TOKEN_EXPIRED))).toMatchObject({ code: ErrorCode.SESSION_ENDED, reason: 'TOKEN_EXPIRED', status: 401 });
  });

  it('hides what an unexpected error says', () => {
    const crash = normalizeError(new Error('Invalid `prisma.patient.findUnique()` invocation: column "x" does not exist'));
    expect(crash).toMatchObject({ code: ErrorCode.INTERNAL, status: 500, unexpected: true });
    expect(crash.message).toBe('Something went wrong on our side. Please try again.');
    expect(normalizeError(new HttpException('upstream exploded', HttpStatus.BAD_GATEWAY)).message).not.toContain('exploded');
  });

  it('keeps a 503 written for people, and an appError’s own message', () => {
    const unavailable = normalizeError(new ServiceUnavailableException('Subscription management isn’t available right now. Please message us and we’ll help.'));
    expect(unavailable).toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE, severity: 'warning', message: 'Subscription management isn’t available right now. Please message us and we’ll help.' });
    expect(normalizeError(appError(ErrorCode.SERVICE_UNAVAILABLE, 'Scheduling is not set up')).message).toBe('Scheduling is not set up');
  });

  it('maps Prisma’s unique and missing-record errors', () => {
    const prisma = (code: string) => Object.assign(new Error('raw'), { name: 'PrismaClientKnownRequestError', code });
    expect(normalizeError(prisma('P2002'))).toMatchObject({ code: ErrorCode.CONFLICT, unexpected: false });
    expect(normalizeError(prisma('P2025'))).toMatchObject({ code: ErrorCode.NOT_FOUND, unexpected: false });
    expect(normalizeError(prisma('P1001'))).toMatchObject({ code: ErrorCode.INTERNAL, unexpected: true });
  });
});

describe('formatGraphQLError', () => {
  const resolverError = (original: Error) => new GraphQLError(original.message, { originalError: original, path: ['me'] });

  it('puts code and severity on extensions and drops internal detail', () => {
    const out = formatGraphQLError({ message: 'Bad Request Exception', path: ['me'], extensions: { code: 'BAD_REQUEST', originalError: { message: 'x' } } }, resolverError(new BadRequestException('Please enter a valid date of birth')));
    expect(out).toMatchObject({ message: 'Please enter a valid date of birth', path: ['me'], extensions: { code: ErrorCode.BAD_REQUEST, severity: 'error' } });
    expect(out.extensions).not.toHaveProperty('originalError');
  });

  it('keeps the session reason where older app builds look for it', () => {
    const out = formatGraphQLError({ message: 'x', extensions: { code: 'UNAUTHENTICATED', originalError: { reason: 'TOKEN_EXPIRED' } } }, resolverError(authFailure(AuthFailureReason.TOKEN_EXPIRED)));
    expect(out.extensions).toMatchObject({ code: ErrorCode.SESSION_ENDED, reason: 'TOKEN_EXPIRED', originalError: { reason: 'TOKEN_EXPIRED' } });
  });

  it('answers a query the schema rejects with a generic message', () => {
    const out = formatGraphQLError({ message: 'Cannot query field "secret" on type "Patient".', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }, new GraphQLError('x'));
    expect(out).toMatchObject({ message: 'That didn’t work. Please check the details and try again.', extensions: { code: ErrorCode.BAD_REQUEST } });
  });

  it('treats a request Apollo refused itself as the client’s mistake, not a crash', () => {
    const out = formatGraphQLError({ message: 'This operation has been blocked as a potential Cross-Site Request Forgery (CSRF).', extensions: { code: 'BAD_REQUEST' } }, new GraphQLError('x'));
    expect(out).toMatchObject({ message: 'That didn’t work. Please check the details and try again.', extensions: { code: ErrorCode.BAD_REQUEST, severity: 'error' } });
  });

  it('never sends a crash’s own text', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = formatGraphQLError({ message: 'Cannot read properties of undefined', extensions: { code: 'INTERNAL_SERVER_ERROR' } }, resolverError(new TypeError('Cannot read properties of undefined')));
    expect(out).toMatchObject({ message: 'Something went wrong on our side. Please try again.', extensions: { code: ErrorCode.INTERNAL } });
  });
});
