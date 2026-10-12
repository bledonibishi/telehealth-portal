import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LabsService } from './labs.service';
import { LabsResolver } from './labs.resolver';
import { TrtMonitoringService } from './trt-monitoring.service';
import { UploadsModule } from '../uploads/uploads.module';
import { LabReaderService } from './lab-reader.service';
import { LabReportsController } from './lab-reports.controller';

@Module({
  imports: [PrismaModule, UploadsModule],
  controllers: [LabReportsController],
  providers: [LabsService, LabsResolver, TrtMonitoringService, LabReaderService],
  exports: [LabsService, TrtMonitoringService],
})
export class LabsModule {}
