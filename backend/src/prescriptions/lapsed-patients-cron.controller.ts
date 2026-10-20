import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LapsedPatientsService } from './lapsed-patients.service';
import { assertCronAuth } from '../common/cron-auth';

/** Called daily by Vercel Cron (see ../../vercel.json), authenticated like the other /internal/cron jobs. */
@Controller('internal/cron')
export class LapsedPatientsCronController {
  private readonly logger = new Logger(LapsedPatientsCronController.name);

  constructor(private config: ConfigService, private lapsed: LapsedPatientsService) {}

  @Get('lapsed-patients')
  async sweep(@Headers('authorization') authorization?: string) {
    assertCronAuth(authorization, this.config.get<string>('CRON_SECRET'));
    const result = await this.lapsed.sweep();
    this.logger.log(`Cron-triggered lapsed patients: ${result.emailed} emailed, ${result.closed} closed`);
    return result;
  }
}
