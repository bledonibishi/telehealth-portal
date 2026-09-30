import { ArgumentsHost, Catch, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlExceptionFilter, GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerException } from '@nestjs/throttler';
import { PostHogService } from './posthog.service';

@Catch()
export class PostHogExceptionFilter extends BaseExceptionFilter implements GqlExceptionFilter {
  constructor(private readonly posthog: PostHogService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const isGraphql = host.getType<string>() === 'graphql';

    // A wrong password or an expired token is expected, and the audit log records failed logins
    if (!(exception instanceof UnauthorizedException)) {
      const gqlContext = isGraphql ? GqlExecutionContext.create(host as ExecutionContext) : null;
      const req = gqlContext ? gqlContext.getContext()?.req : host.switchToHttp().getRequest();

      this.posthog.captureException(exception, req?.user?.id, {
        $ip: req?.ip,
        $user_agent: req?.headers?.['user-agent'],
        ...(gqlContext ? { graphql_field: gqlContext.getInfo()?.fieldName } : { http_path: req?.path }),
        ...(exception instanceof ThrottlerException && { $exception_level: 'warning' }),
      });
    }

    // GraphQL turns a returned exception into an error response. A plain HTTP
    // route has no such step — without writing the response, the request hangs.
    if (isGraphql) return exception;
    return super.catch(exception, host);
  }
}
