import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PostHogExceptionFilter } from './posthog-exception.filter';
import { PostHogLoggerService } from './posthog-logger.service';
import { PostHogService } from './posthog.service';

@Global()
@Module({
  providers: [
    PostHogService,
    PostHogLoggerService,
    {
      provide: APP_FILTER,
      useClass: PostHogExceptionFilter,
    },
  ],
  exports: [PostHogService, PostHogLoggerService],
})
export class PostHogModule {}
