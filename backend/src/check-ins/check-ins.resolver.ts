import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { UseGuards, ForbiddenException } from '@nestjs/common';
import { CheckInsService } from './check-ins.service';
import { CheckInModel } from './models/check-in.model';
import { SubmitCheckInInput } from './dto/submit-check-in.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => CheckInModel)
export class CheckInsResolver {
  constructor(private checkInsService: CheckInsService) {}

  // Deliberately unauthenticated: the token itself (emailed to the patient,
  // unguessable, single-use, expiring) is the proof of identity — same model
  // as the existing account-activation link.
  @Query(() => CheckInModel)
  checkInByToken(@Args('token') token: string) {
    return this.checkInsService.findByToken(token);
  }

  @Mutation(() => CheckInModel)
  submitCheckIn(@Args('token') token: string, @Args('input') input: SubmitCheckInInput) {
    return this.checkInsService.submit(token, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => CheckInModel, { description: 'Clinician-only: move a not-yet-sent check-in’s due date, mainly for testing.' })
  rescheduleCheckIn(
    @CurrentUser() user: { role: string },
    @Args('id', { type: () => ID }) id: string,
    @Args('dueAt') dueAt: Date,
  ) {
    if (user.role !== 'CLINICIAN') throw new ForbiddenException('Clinicians only');
    return this.checkInsService.reschedule(id, dueAt);
  }

  // Covers check-ins reached via patient.checkIns (raw Prisma rows), which
  // don't go through the service's toModel() the way the token-flow queries do.
  @ResolveField(() => String, { nullable: true })
  checkInUrl(@Parent() checkIn: any) {
    return checkIn.checkInUrl ?? this.checkInsService.buildUrl(checkIn.token);
  }
}
