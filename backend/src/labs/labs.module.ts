import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LabsService } from './labs.service';
import { LabsResolver } from './labs.resolver';
import { TrtMonitoringService } from './trt-monitoring.service';

@Module({
  imports: [PrismaModule],
  providers: [LabsService, LabsResolver, TrtMonitoringService],
  exports: [LabsService, TrtMonitoringService],
})
export class LabsModule {}
