import { Controller, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotifierService } from './notifier.service';

/**
 * The in-process @Cron timers in NotifierService only fire while some instance happens to be warm, which Vercel's
 * serverless deployment never guarantees. Vercel Cron Jobs (see ../../vercel.json) call these endpoints instead,
 * authenticating with the bearer token Vercel attaches when CRON_SECRET is set (same as dosing-cron.controller.ts).
 * Both jobs are safe to run twice at once: each unread-message email is claimed atomically before it is sent, and
 * deleting twice deletes nothing more.
 */
@Controller('internal/cron')
export class NotificationsCronController {
  private readonly logger = new Logger(NotificationsCronController.name);

  constructor(
    private config: ConfigService,
    private notifier: NotifierService,
  ) {}

  private authorize(authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret || authorization !== `Bearer ${secret}`) throw new UnauthorizedException();
  }

  @Get('unread-message-emails')
  async unreadMessageEmails(@Headers('authorization') authorization?: string) {
    this.authorize(authorization);
    const sent = await this.notifier.emailUnreadMessages();
    this.logger.log(`Cron-triggered unread-message emails: ${sent} sent`);
    return { sent };
  }

  @Get('prune-notifications')
  async pruneNotifications(@Headers('authorization') authorization?: string) {
    this.authorize(authorization);
    const deleted = await this.notifier.prune();
    this.logger.log(`Cron-triggered notification pruning: ${deleted} deleted`);
    return { deleted };
  }
}
