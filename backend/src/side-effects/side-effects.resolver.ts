import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';
import { LogSideEffectScoresInput, ReportSideEffectsInput, SideEffectAlertModel, SideEffectReportModel, SideEffectScoreEntryModel, SideEffectSummaryModel } from './models/side-effect.model';
import { AuditRead } from '../audit/audit-read.interceptor';
import { SideEffectsService } from './side-effects.service';

@Resolver()
export class SideEffectsResolver {
  constructor(private sideEffects: SideEffectsService) {}

  // The patient id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Mutation(() => SideEffectReportModel, { description: 'Tell your doctor about a side effect without waiting for the monthly check-in' })
  reportSideEffects(@CurrentUser() user: AuthUser, @Args('input') input: ReportSideEffectsInput) {
    return this.sideEffects.report(user.id, input);
  }

  @Authorized('PATIENT')
  @Query(() => [SideEffectReportModel], { description: 'The signed-in patient’s recent reports, newest first' })
  mySideEffectReports(@CurrentUser() user: AuthUser) {
    return this.sideEffects.mine(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => SideEffectScoreEntryModel, { description: 'Your weekly side-effect scores, 1 (none) to 10 (worst). A high score also alerts your doctor.' })
  logMySideEffectScores(@CurrentUser() user: AuthUser, @Args('input') input: LogSideEffectScoresInput) {
    return this.sideEffects.logScores(user.id, input);
  }

  @Authorized('PATIENT')
  @Query(() => [SideEffectScoreEntryModel], { description: 'The signed-in patient’s recent weekly scores, newest first' })
  mySideEffectScores(@CurrentUser() user: AuthUser) {
    return this.sideEffects.myScores(user.id);
  }

  @Authorized(...PRESCRIBERS)
  @AuditRead('Patient', 'patientId')
  @Query(() => SideEffectSummaryModel, { description: 'What to read about a patient’s side effects before approving their next supply or dose. The view is audited.' })
  sideEffectSummary(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.sideEffects.summaryFor(patientId);
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [SideEffectAlertModel], { description: 'Side effects patients reported that no doctor has acknowledged yet, most severe first' })
  sideEffectAlerts() {
    return this.sideEffects.alerts();
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => SideEffectReportModel, { description: 'Mark a reported side effect as seen. Audited.' })
  acknowledgeSideEffect(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.sideEffects.acknowledge(user.id, id);
  }
}
