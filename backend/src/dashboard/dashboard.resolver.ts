import { Resolver, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardMetrics } from './dashboard.model';

@Resolver()
export class DashboardResolver {
  constructor(private dashboardService: DashboardService) {}

  @Query(() => DashboardMetrics)
  @UseGuards(GqlAuthGuard)
  dashboardMetrics() {
    return this.dashboardService.getMetrics();
  }
}
