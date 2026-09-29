import { Resolver, Query } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { ClinicianRole } from '../common/enums';
import { DashboardService } from './dashboard.service';
import { DashboardMetrics } from './dashboard.model';

@Resolver()
export class DashboardResolver {
  constructor(private dashboardService: DashboardService) {}

  @Query(() => DashboardMetrics)
  @Authorized(ClinicianRole.ADMIN)
  dashboardMetrics() {
    return this.dashboardService.getMetrics();
  }
}
