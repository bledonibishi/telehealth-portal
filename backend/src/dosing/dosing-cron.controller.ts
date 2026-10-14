import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DosingService } from './dosing.service';
import { assertCronAuth } from '../common/cron-auth';

/**
 * The in-process @Cron in DosingService only fires while some instance
 * happens to be warm, which Vercel's serverless deployment never guarantees.
 * Vercel Cron Jobs (see ../../vercel.json) call this endpoint hourly instead,
 * authenticating with the bearer token Vercel automatically attaches when
 * CRON_SECRET is set: https://vercel.com/docs/cron-jobs/manage-cron-jobs.
 * sendReminders() claims each dose atomically, so this and the in-process
 * timer can safely overlap without double-sending.
 */
@Controller('internal/cron')
export class DosingCronController {
  private readonly logger = new Logger(DosingCronController.name);

  constructor(
    private config: ConfigService,
    private dosing: DosingService,
  ) {}

  @Get('dose-reminders')
  async triggerDoseReminders(@Headers('authorization') authorization?: string) {
    assertCronAuth(authorization, this.config.get<string>('CRON_SECRET'));

    const sent = await this.dosing.sendReminders();
    this.logger.log(`Cron-triggered dose reminders: ${sent} sent`);
    return { sent };
  }
}
