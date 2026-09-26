import { ArgumentsHost, Catch, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GqlExceptionFilter, GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerException } from '@nestjs/throttler';
import { PostHogService } from './posthog.service';

@Catch()
export class PostHogExceptionFilter implements GqlExceptionFilter {
  constructor(private readonly posthog: PostHogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    // A wrong password or an expired token is expected, and the audit log records failed logins
    if (exception instanceof UnauthorizedException) return exception;

    const gqlContext = GqlExecutionContext.create(host as ExecutionContext);
    const req = gqlContext.getContext()?.req;

    this.posthog.captureException(exception, req?.user?.id, {
      $ip: req?.ip,
      $user_agent: req?.headers?.['user-agent'],
      graphql_field: gqlContext.getInfo()?.fieldName,
      ...(exception instanceof ThrottlerException && { $exception_level: 'warning' }),
    });
    return exception;
  }
}
