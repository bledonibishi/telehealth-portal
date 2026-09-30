import { Resolver, Query, Args, ID, Int } from '@nestjs/graphql';
import { TrendsService } from './trends.service';
import { TrendPointModel } from './models/trend-point.model';
import { AdherenceWeekModel } from './models/adherence-week.model';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuditRead } from '../audit/audit-read.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';

@Resolver()
export class TrendsResolver {
  constructor(private trends: TrendsService) {}

  @Authorized('PATIENT')
  @Query(() => [TrendPointModel], { description: "A numeric answer (e.g. weight_kg) from the authenticated patient's completed check-ins, oldest first" })
  myCheckInAnswerTrend(@CurrentUser() user: AuthUser, @Args('questionId') questionId: string) {
    return this.trends.checkInAnswerTrend(user.id, questionId);
  }

  @Authorized(...PRESCRIBERS)
  @AuditRead('Patient', 'patientId')
  @Query(() => [TrendPointModel], { description: "A numeric answer (e.g. weight_kg) from a patient's completed check-ins, oldest first" })
  checkInAnswerTrend(@Args('patientId', { type: () => ID }) patientId: string, @Args('questionId') questionId: string) {
    return this.trends.checkInAnswerTrend(patientId, questionId);
  }

  @Authorized('PATIENT')
  @Query(() => [AdherenceWeekModel], { description: "The authenticated patient's dose adherence, bucketed by week" })
  myDoseAdherenceTrend(@CurrentUser() user: AuthUser, @Args('weeks', { type: () => Int, nullable: true }) weeks?: number | null) {
    return this.trends.doseAdherenceTrend(user.id, weeks);
  }

  @Authorized(...PRESCRIBERS)
  @AuditRead('Patient', 'patientId')
  @Query(() => [AdherenceWeekModel], { description: "A patient's dose adherence, bucketed by week" })
  doseAdherenceTrend(@Args('patientId', { type: () => ID }) patientId: string, @Args('weeks', { type: () => Int, nullable: true }) weeks?: number | null) {
    return this.trends.doseAdherenceTrend(patientId, weeks);
  }
}
