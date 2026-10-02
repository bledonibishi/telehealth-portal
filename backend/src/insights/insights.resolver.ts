import { BadRequestException } from '@nestjs/common';
import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { ClinicianRole } from '../common/enums';
import { RevenueService } from './revenue.service';
import { FunnelService } from './funnel.service';
import { ClinicianPerformanceService } from './clinician-performance.service';
import { ClinicianPerformanceModel, RevenueOverviewModel, SalesFunnelModel } from './models/insights.model';

const ALLOWED_PERIODS = [7, 30, 90];

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
  @Query(() => [ClinicianPerformanceModel], { description: 'What each doctor decided, prescribed and reviewed in the period' })
  clinicianPerformance(@Args('days', { type: () => Int, nullable: true }) days?: number) {
    return this.performance.report(period(days)) as Promise<ClinicianPerformanceModel[]>;
  }
}
