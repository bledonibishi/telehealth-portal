import { Controller, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportBotService } from './support-bot.service';

/** Called every minute by Vercel Cron (see ../../vercel.json), authenticated like the other /internal/cron jobs. */
@Controller('internal/cron')
export class SupportBotCronController {
  private readonly logger = new Logger(SupportBotCronController.name);

  constructor(private config: ConfigService, private bot: SupportBotService) {}

  @Get('support-bot')
  async trigger(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret || authorization !== `Bearer ${secret}`) throw new UnauthorizedException();
    const answered = await this.bot.processDue();
    const closed = await this.bot.closeStale();
    if (answered || closed) this.logger.log(`Support assistant: ${answered} conversation(s) handled, ${closed} closed`);
    return { answered, closed };
  }
}
