import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';
import { ReportSideEffectsInput, SideEffectAlertModel, SideEffectReportModel } from './models/side-effect.model';
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
