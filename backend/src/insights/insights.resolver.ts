import { BadRequestException } from '@nestjs/common';
import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { ClinicianRole } from '../common/enums';
import { RevenueService } from './revenue.service';
import { FunnelService } from './funnel.service';
import { ClinicianPerformanceService } from './clinician-performance.service';
import { MonthlyReportService } from './monthly-report.service';
import { ClinicianPerformanceModel, MonthlyReportModel, RevenueOverviewModel, SalesFunnelModel } from './models/insights.model';

const ALLOWED_PERIODS = [7, 30, 90];
const ALLOWED_MONTHS = [3, 6, 12];

function period(days?: number | null) {
  const d = days ?? 30;
  if (!ALLOWED_PERIODS.includes(d)) throw new BadRequestException(`days must be one of ${ALLOWED_PERIODS.join(', ')}`);
  return d;
}

/** Business figures for the owner: admins only. */
@Resolver()
export class InsightsResolver {
  constructor(
    private revenue: RevenueService,
    private funnel: FunnelService,
    private performance: ClinicianPerformanceService,
    private monthly: MonthlyReportService,
  ) {}

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => RevenueOverviewModel, { description: 'Monthly recurring revenue, subscribers and churn, read from Stripe' })
  revenueOverview(@Args('days', { type: () => Int, nullable: true }) days?: number) {
    return this.revenue.overview(period(days)) as Promise<RevenueOverviewModel>;
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => SalesFunnelModel, { description: 'From completing the eligibility quiz to the first shipment' })
  salesFunnel(@Args('days', { type: () => Int, nullable: true }) days?: number) {
    return this.funnel.funnel(period(days)) as Promise<SalesFunnelModel>;
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => MonthlyReportModel, { description: 'The clinic month by month: new patients, revenue, check-in decisions and how much weight patients have lost' })
  monthlyReport(@Args('months', { type: () => Int, nullable: true }) months?: number) {
    const n = months ?? 6;
    if (!ALLOWED_MONTHS.includes(n)) throw new BadRequestException(`months must be one of ${ALLOWED_MONTHS.join(', ')}`);
    return this.monthly.report(n) as Promise<MonthlyReportModel>;
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [ClinicianPerformanceModel], { description: 'What each doctor decided, prescribed and reviewed in the period' })
  clinicianPerformance(@Args('days', { type: () => Int, nullable: true }) days?: number) {
    return this.performance.report(period(days)) as Promise<ClinicianPerformanceModel[]>;
  }
}
