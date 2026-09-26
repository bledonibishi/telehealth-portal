import { ArgumentsHost, Catch, ExecutionContext, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { GqlExceptionFilter, GqlExecutionContext } from '@nestjs/graphql';
import { PostHogService } from './posthog.service';

@Catch()
export class PostHogExceptionFilter implements GqlExceptionFilter, ExceptionFilter {
  constructor(private readonly posthog: PostHogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType<'http' | 'graphql'>() === 'http') {
      const ctx = host.switchToHttp();
      const request = ctx.getRequest();
      const response = ctx.getResponse();

      this.posthog.captureException(exception, request?.user?.id);

      const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      const body =
        exception instanceof HttpException
          ? exception.getResponse()
          : { statusCode: status, message: 'Internal server error' };

      response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    const gqlContext = GqlExecutionContext.create(host as ExecutionContext).getContext();
    this.posthog.captureException(exception, gqlContext?.req?.user?.id);
    return exception;
  }
}
