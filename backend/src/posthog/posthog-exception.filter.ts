import { ArgumentsHost, Catch, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlExceptionFilter, GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerException } from '@nestjs/throttler';
import { normalizeError } from '../common/errors/normalize-error';
import { PostHogService } from './posthog.service';
import { ErrorCode } from '@telehealth/shared-types';

// Expected failures that are not 401s. Like the 401s, they are recorded in the audit log, so tracking them is noise.
const EXPECTED_FAILURES = new Set<ErrorCode>([ErrorCode.WRONG_CURRENT_PASSWORD]);

@Catch()
export class PostHogExceptionFilter extends BaseExceptionFilter implements GqlExceptionFilter {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly posthog: PostHogService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const isGraphql = host.getType<string>() === 'graphql';

    // A wrong password or an expired token is expected, and the audit log records failed logins
    if (!(exception instanceof UnauthorizedException) && !EXPECTED_FAILURES.has(normalizeError(exception).code)) {
      const gqlContext = isGraphql ? GqlExecutionContext.create(host as ExecutionContext) : null;
      const req = gqlContext ? gqlContext.getContext()?.req : host.switchToHttp().getRequest();

      this.posthog.captureException(exception, req?.user?.id, {
        $ip: req?.ip,
        $user_agent: req?.headers?.['user-agent'],
        ...(gqlContext ? { graphql_field: gqlContext.getInfo()?.fieldName } : { http_path: req?.path }),
        ...(exception instanceof ThrottlerException && { $exception_level: 'warning' }),
      });
    }

    // GraphQL turns a returned exception into an error response (shaped by formatGraphQLError). A plain HTTP
    // route has no such step — without writing the response, the request hangs.
    if (isGraphql) return exception;
    return this.respond(exception, host);
  }

  // The same { code, severity, message } a GraphQL error carries, plus the status Nest has always sent.
  private respond(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (res.headersSent) return super.catch(exception, host);
    const { status, unexpected, ...payload } = normalizeError(exception);
    if (unexpected) this.logger.error(exception);
    res.status(status).json({ statusCode: status, ...payload });
  }
}
