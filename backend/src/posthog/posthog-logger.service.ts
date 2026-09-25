import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logs, Logger } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';

@Injectable()
export class PostHogLoggerService implements OnApplicationShutdown {
  private readonly sdk: NodeSDK | null;
  private readonly logger: Logger | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('POSTHOG_API_KEY');
    const host = config.get<string>('POSTHOG_HOST');

    if (!apiKey || !host) {
      this.sdk = null;
      this.logger = null;
      return;
    }

    this.sdk = new NodeSDK({
      resource: resourceFromAttributes({
        'service.name': 'telehealth-backend',
        'deployment.environment': config.get<string>('NODE_ENV', 'development'),
      }),
      logRecordProcessors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${host}/i/v1/logs`,
            headers: { Authorization: `Bearer ${apiKey}` },
          }),
        }),
      ],
    });
    this.sdk.start();
    this.logger = logs.getLogger('posthog-integration');
  }

  info(body: string, attributes: Record<string, string | number | boolean>) {
    this.logger?.emit({ severityText: 'INFO', body, attributes });
  }

  async onApplicationShutdown() {
    await this.sdk?.shutdown();
  }
}
