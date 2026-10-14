import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsCleanupService } from './uploads-cleanup.service';
import { assertCronAuth } from '../common/cron-auth';

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
    assertCronAuth(authorization, this.config.get<string>('CRON_SECRET'));

    const progress = await this.cleanup.purgeOrphanedProgressPhotos();
    const body = await this.cleanup.purgeOrphanedBodyPhotos();
    const labReports = await this.cleanup.purgeOrphanedLabReports();
    const support = await this.cleanup.purgeSupportAttachments();
    if (progress || body || labReports || support) this.logger.log(`Purged ${progress} unattached progress photo(s), ${body} unused body photo(s), ${labReports} unsent lab report(s) and ${support} support attachment(s)`);
    return { removed: progress + body + labReports + support };
  }
}
