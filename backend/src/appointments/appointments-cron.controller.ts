import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentsService } from './appointments.service';
import { assertCronAuth } from '../common/cron-auth';

/** Called hourly by Vercel Cron (see ../../vercel.json): withdraws unpaid consultations and refunds unanswered "refund or new time" offers. */
@Controller('internal/cron')
export class AppointmentsCronController {
  private readonly logger = new Logger(AppointmentsCronController.name);

  constructor(private config: ConfigService, private appointments: AppointmentsService) {}

  @Get('consultation-payments')
  async sweep(@Headers('authorization') authorization?: string) {
    assertCronAuth(authorization, this.config.get<string>('CRON_SECRET'));
    const withdrawn = await this.appointments.expireUnpaid();
    this.logger.log(`Cron-triggered consultation payments: ${withdrawn} withdrawn`);
    return { withdrawn };
  }
}
