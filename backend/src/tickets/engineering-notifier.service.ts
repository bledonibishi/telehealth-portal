import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SlackResult = 'SENT' | 'NOT_CONFIGURED' | 'FAILED';

/**
 * Tells the engineers in Slack that support has passed them something. It posts to a Slack "incoming webhook": set
 * ENGINEERING_SLACK_WEBHOOK_URL in backend/.env to its address (https://hooks.slack.com/services/...). Without it nothing is
 * sent and the portal says so, so support knows to tell the engineers another way. A failure never stops the ticket being marked.
 *
 * What is posted is only what support wrote for the engineers, the ticket number and a link: never the patient's name or details.
 */
@Injectable()
export class EngineeringNotifierService {
  private readonly logger = new Logger(EngineeringNotifierService.name);

  constructor(private config: ConfigService) {}

  get configured() {
    return this.url() !== null;
  }

  private url(): string | null {
    const raw = this.config.get<string>('ENGINEERING_SLACK_WEBHOOK_URL')?.trim();
    // Only an https address: never something that could point at an internal service.
    return raw && /^https:\/\/[^\s]+$/.test(raw) ? raw : null;
  }

  async post(text: string): Promise<SlackResult> {
    const url = this.url();
    if (!url) return 'NOT_CONFIGURED';
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        this.logger.error(`Slack answered ${res.status} to the engineering message`);
        return 'FAILED';
      }
      return 'SENT';
    } catch (err) {
      this.logger.error(`Could not reach Slack: ${(err as Error)?.message}`);
      return 'FAILED';
    }
  }
}
