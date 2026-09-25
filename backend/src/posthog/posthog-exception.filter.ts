import { ArgumentsHost, Catch, ExecutionContext } from '@nestjs/common';
import { GqlExceptionFilter, GqlExecutionContext } from '@nestjs/graphql';
import { PostHogService } from './posthog.service';

@Catch()
export class PostHogExceptionFilter implements GqlExceptionFilter {
  constructor(private readonly posthog: PostHogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = GqlExecutionContext.create(host as ExecutionContext).getContext();
    const distinctId = context?.req?.user?.id;

    this.posthog.captureException(exception, distinctId);
    return exception;
  }
}
