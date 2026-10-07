import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { AuditRead } from '../audit/audit-read.interceptor';
import { CheckInsService } from './check-ins.service';
import { CheckInModel, CheckInReportModel } from './models/check-in.model';
import { CheckInReportService } from './check-in-report.service';
import { SubmitCheckInInput } from './dto/submit-check-in.input';
import { ReviewCheckInInput } from './dto/review-check-in.input';
import { CheckInReviewService } from './check-in-review.service';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, PRESCRIBERS, STAFF } from '../auth/access-roles';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => CheckInModel)
export class CheckInsResolver {
  constructor(
    private checkInsService: CheckInsService,
    private review: CheckInReviewService,
    private reports: CheckInReportService,
  ) {}

  // The patient id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Query(() => [CheckInReportModel], { description: 'The signed-in patient’s check-in reports (weeks 4, 8, 12 …), newest first' })
  myCheckInReports(@CurrentUser() user: AuthUser) {
    return this.reports.listFor(user.id);
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [CheckInModel], { description: 'Completed check-ins waiting for a doctor — critical flags first, then oldest' })
  checkInReviewQueue() {
    return this.review.queue();
  }

  @Authorized(...STAFF)
  @AuditRead('CheckIn')
  @Query(() => CheckInModel)
  checkIn(@Args('id', { type: () => ID }) id: string) {
    return this.review.findById(id);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => CheckInModel, { description: 'Decide the next step after a monthly check-in' })
  reviewCheckIn(@CurrentUser() user: AuthUser, @Args('input') input: ReviewCheckInInput) {
    return this.review.review(user.id, input);
  }

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

  @Authorized(...STAFF)
  @Mutation(() => CheckInModel, { description: 'Clinician-only: move a not-yet-sent check-in’s due date, mainly for testing.' })
  rescheduleCheckIn(
    @Args('id', { type: () => ID }) id: string,
    @Args('dueAt') dueAt: Date,
  ) {
    return this.checkInsService.reschedule(id, dueAt);
  }

  @ResolveField(() => String, { nullable: true })
  reportUrl(@Parent() checkIn: { id: string; reviewedAt?: Date | null; kind?: string | null }) {
    return checkIn.reviewedAt && checkIn.kind === 'GLP1' ? `/check-ins/${checkIn.id}/report` : null;
  }

  // Covers check-ins reached via patient.checkIns (raw Prisma rows), which
  // don't go through the service's toModel() the way the token-flow queries do.
  @ResolveField(() => String, { nullable: true })
  checkInUrl(@Parent() checkIn: any) {
    return checkIn.checkInUrl ?? this.checkInsService.buildUrl(checkIn.token);
  }
}
