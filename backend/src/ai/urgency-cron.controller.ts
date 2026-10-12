import { Controller, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageUrgencyService } from './message-urgency.service';

/** Called every 10 minutes by Vercel Cron (see ../../vercel.json), authenticated like the other /internal/cron jobs. */
@Controller('internal/cron')
export class UrgencyCronController {
  private readonly logger = new Logger(UrgencyCronController.name);

  constructor(private config: ConfigService, private urgency: MessageUrgencyService) {}

  @Get('urgency-sweep')
  async trigger(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret || authorization !== `Bearer ${secret}`) throw new UnauthorizedException();
    const marked = await this.urgency.sweep();
    if (marked) this.logger.log(`Urgency sweep: ${marked} message(s) marked`);
    return { marked };
  }
}
