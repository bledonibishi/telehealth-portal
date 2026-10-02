import { Resolver, Query, Mutation, Args, ID, Float } from '@nestjs/graphql';
import { WeightJourneyService } from './weight-journey.service';
import { WeightJourneyModel } from './models/weight-journey.model';
import { CorrectCheckInWeightInput, CorrectWeightGoalInput } from './dto/weight-journey.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';
import { AuditRead } from '../audit/audit-read.interceptor';

@Resolver(() => WeightJourneyModel)
export class WeightJourneyResolver {
  constructor(private journey: WeightJourneyService) {}

  @Authorized('PATIENT')
  @Query(() => WeightJourneyModel, { nullable: true, description: 'The signed-in patient’s own journey. Null for programmes without one.' })
  myWeightJourney(@CurrentUser() user: AuthUser) {
    return this.journey.forPatient(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => WeightJourneyModel)
  setMyTargetWeight(@CurrentUser() user: AuthUser, @Args('targetWeightKg', { type: () => Float }) targetWeightKg: number) {
    return this.journey.setTarget(user.id, targetWeightKg);
  }

  // Weight history is clinical: doctors only, not support or fulfilment staff.
  @Authorized(...PRESCRIBERS)
  @AuditRead('WeightJourney', 'patientId')
  @Query(() => WeightJourneyModel, { nullable: true })
  weightJourneyForPatient(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.journey.forPatient(patientId);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => WeightJourneyModel, { description: 'Correct a wrong starting or target weight. Audited.' })
  correctWeightGoal(@CurrentUser() user: AuthUser, @Args('input') input: CorrectWeightGoalInput) {
    return this.journey.correctGoal(user.id, input);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => WeightJourneyModel, { description: 'Correct a mistyped check-in weight. The original is kept in the audit log.' })
  correctCheckInWeight(@CurrentUser() user: AuthUser, @Args('input') input: CorrectCheckInWeightInput) {
    return this.journey.correctCheckInWeight(user.id, input);
  }
}
