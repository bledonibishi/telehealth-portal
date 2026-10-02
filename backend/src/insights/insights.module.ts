import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RevenueService } from './revenue.service';
import { FunnelService } from './funnel.service';
import { ClinicianPerformanceService } from './clinician-performance.service';
import { InsightsResolver } from './insights.resolver';

@Module({
  imports: [PrismaModule],
  providers: [RevenueService, FunnelService, ClinicianPerformanceService, InsightsResolver],
})
export class InsightsModule {}
