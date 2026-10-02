import { Controller, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsCleanupService } from './uploads-cleanup.service';

/** Called daily by Vercel Cron (see ../../vercel.json), authenticated like the other /internal/cron jobs. */
@Controller('internal/cron')
export class UploadsCleanupController {
  private readonly logger = new Logger(UploadsCleanupController.name);

  constructor(
    private config: ConfigService,
    private cleanup: UploadsCleanupService,
  ) {}

  @Get('purge-orphan-photos')
  async purge(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret || authorization !== `Bearer ${secret}`) throw new UnauthorizedException();

    const removed = await this.cleanup.purgeOrphanedProgressPhotos();
    if (removed) this.logger.log(`Purged ${removed} unattached progress photo(s)`);
    return { removed };
  }
}
