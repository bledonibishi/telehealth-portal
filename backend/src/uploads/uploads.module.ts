import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { FILE_STORAGE, FallbackFileStorage, LocalFileStorage, S3FileStorage } from './file-storage';
import { UploadsCleanupController } from './uploads-cleanup.controller';
import { UploadsCleanupService } from './uploads-cleanup.service';

@Module({
  imports: [PrismaModule],
  controllers: [UploadsController, UploadsCleanupController],
  providers: [
    UploadsService,
    UploadsCleanupService,
    {
      // S3 when UPLOAD_S3_BUCKET is set, otherwise the server's disk (UPLOAD_DIR). With S3, files that
      // were uploaded to the disk earlier are still read from it, so switching loses nothing.
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const disk = new LocalFileStorage(config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'));
        const bucket = config.get<string>('UPLOAD_S3_BUCKET')?.trim();
        if (!bucket) return disk;
        const region = config.get<string>('UPLOAD_S3_REGION')?.trim();
        if (!region) throw new Error('UPLOAD_S3_REGION is required when UPLOAD_S3_BUCKET is set');
        return new FallbackFileStorage(new S3FileStorage(bucket, region, config.get<string>('UPLOAD_S3_KMS_KEY_ID')?.trim() || undefined), disk);
      },
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
