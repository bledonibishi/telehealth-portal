import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { WeightMeasurementsService } from './weight-measurements.service';
import { WeightJourneyModel, WeightTimelineModel } from './models/weight-journey.model';
import { AddWeightInput, CorrectWeightEntryInput } from './dto/weight-journey.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS, STAFF } from '../auth/access-roles';
import { AuditRead } from '../audit/audit-read.interceptor';

@Resolver()
export class WeightMeasurementsResolver {
  constructor(private measurements: WeightMeasurementsService) {}

  // A patient can only ever act on their own data: the id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Query(() => WeightTimelineModel, { description: 'The signed-in patient’s weighings in a date range, oldest first' })
  myWeightTimeline(
    @CurrentUser() user: AuthUser,
    @Args('from') from: Date,
    @Args('to') to: Date,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ) {
    return this.measurements.timeline(user.id, from, to, limit);
  }

  @Authorized('PATIENT')
  @Mutation(() => WeightJourneyModel, { description: 'Record a weight at any date and time. Never overwrites an earlier entry.' })
  addMyWeight(@CurrentUser() user: AuthUser, @Args('input') input: AddWeightInput) {
    return this.measurements.add(user.id, input);
  }

  @Authorized('PATIENT')
  @Mutation(() => WeightJourneyModel, { description: 'Remove one of your own mistaken entries (kept on record as voided)' })
  voidMyWeight(@CurrentUser() user: AuthUser, @Args('entryId', { type: () => ID }) entryId: string) {
    return this.measurements.voidOwn(user.id, entryId);
  }

  @Authorized(...STAFF)
  @AuditRead('WeightJourney', 'patientId')
  @Query(() => WeightTimelineModel)
  weightTimelineForPatient(
    @Args('patientId', { type: () => ID }) patientId: string,
    @Args('from') from: Date,
    @Args('to') to: Date,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ) {
    return this.measurements.timeline(patientId, from, to, limit);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => WeightJourneyModel, { description: 'Replace a wrong daily weight: the original is voided and kept, the fix is added. Audited.' })
  correctWeightEntry(@CurrentUser() user: AuthUser, @Args('input') input: CorrectWeightEntryInput) {
    return this.measurements.correct(user.id, input);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => WeightJourneyModel, { description: 'Void a daily weight that should not exist. Audited.' })
  voidWeightEntry(
    @CurrentUser() user: AuthUser,
    @Args('entryId', { type: () => ID }) entryId: string,
    @Args('reason') reason: string,
  ) {
    return this.measurements.voidByStaff(user.id, entryId, reason);
  }
}
