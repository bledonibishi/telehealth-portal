import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RevenueService } from './revenue.service';
import { FunnelService } from './funnel.service';
import { VisitorsService } from './visitors.service';
import { ClinicianPerformanceService } from './clinician-performance.service';
import { MonthlyReportService } from './monthly-report.service';
import { InsightsResolver } from './insights.resolver';

@Module({
  imports: [PrismaModule],
  providers: [RevenueService, VisitorsService, FunnelService, ClinicianPerformanceService, MonthlyReportService, InsightsResolver],
})
export class InsightsModule {}
