import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { FILE_STORAGE, LocalFileStorage, S3FileStorage } from './file-storage';

@Module({
  imports: [PrismaModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      // S3 when UPLOAD_S3_BUCKET is set, otherwise the server's disk (UPLOAD_DIR).
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const bucket = config.get<string>('UPLOAD_S3_BUCKET')?.trim();
        if (!bucket) return new LocalFileStorage(config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'));
        const region = config.get<string>('UPLOAD_S3_REGION')?.trim();
        if (!region) throw new Error('UPLOAD_S3_REGION is required when UPLOAD_S3_BUCKET is set');
        return new S3FileStorage(bucket, region, config.get<string>('UPLOAD_S3_KMS_KEY_ID')?.trim() || undefined);
      },
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
