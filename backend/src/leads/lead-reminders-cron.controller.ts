import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadRemindersService } from './lead-reminders.service';
import { assertCronAuth } from '../common/cron-auth';

/**
 * Called hourly by Vercel Cron (see ../../vercel.json), authenticated like the other /internal/cron jobs: the in-process
 * timer only fires while an instance happens to be warm. sendDue() claims each lead before emailing it, so this and the
 * timer can overlap safely. Does nothing unless LEAD_REMINDERS_ENABLED=true.
 */
@Controller('internal/cron')
export class LeadRemindersCronController {
  private readonly logger = new Logger(LeadRemindersCronController.name);

  constructor(private config: ConfigService, private reminders: LeadRemindersService) {}

  @Get('lead-reminders')
  async trigger(@Headers('authorization') authorization?: string) {
    assertCronAuth(authorization, this.config.get<string>('CRON_SECRET'));
    const sent = await this.reminders.sendDue();
    this.logger.log(`Cron-triggered lead reminders: ${sent} sent`);
    return { sent };
  }
}
