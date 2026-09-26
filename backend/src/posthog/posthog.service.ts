import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

@Injectable()
export class PostHogService implements OnApplicationShutdown {
  private readonly client: PostHog | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('POSTHOG_API_KEY');
    const host = config.get<string>('POSTHOG_HOST');
    const isProduction = config.get<string>('NODE_ENV') === 'production';

    if (!apiKey) {
      if (!isProduction) {
        throw new Error(
          'POSTHOG_API_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_API_KEY is configured',
        );
      }
      this.client = null;
      return;
    }

    if (!host) {
      if (!isProduction) {
        throw new Error(
          'POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured',
        );
      }
      this.client = null;
      return;
    }

    this.client = new PostHog(apiKey, {
      host,
      enableExceptionAutocapture: true,
    });
  }

  capture(distinctId: string, event: string, properties?: Record<string, unknown>) {
    this.client?.capture({ distinctId, event, properties });
  }

  identify(distinctId: string, properties: Record<string, unknown>) {
    this.client?.identify({ distinctId, properties });
  }

  captureException(error: unknown, distinctId?: string) {
    this.client?.captureException(error, distinctId);
  }

  async onApplicationShutdown() {
    await this.client?.shutdown();
  }
}
