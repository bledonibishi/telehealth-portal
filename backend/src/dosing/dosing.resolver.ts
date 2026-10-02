import { Resolver, Query, Mutation, Args, ID, Int, ResolveField, Parent } from '@nestjs/graphql';
import { DosingService } from './dosing.service';
import { DoseEventModel } from './models/dose-event.model';
import { ProductModel, ProductStrengthModel } from '../catalog/models/product.model';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuditRead } from '../audit/audit-read.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS, STAFF } from '../auth/access-roles';
import { MissedDoseAlertModel, MissedDoseStatusModel } from './models/missed-dose-alert.model';
import { DoseSummaryModel } from './models/dose-summary.model';

type ParentEvent = { prescriptionItem?: { product: ProductModel; strength: ProductStrengthModel } };

@Resolver(() => DoseEventModel)
export class DosingResolver {
  constructor(private dosing: DosingService) {}

  @Authorized('PATIENT')
  @Query(() => [DoseEventModel], { description: "The authenticated patient's dose calendar — recent history plus what's ahead" })
  myDoseCalendar(
    @CurrentUser() user: AuthUser,
    @Args('fromDays', { type: () => Int, nullable: true }) fromDays?: number,
    @Args('toDays', { type: () => Int, nullable: true }) toDays?: number,
  ) {
    return this.dosing.calendarFor(user.id, { fromDays, toDays });
  }

  @Authorized(...STAFF)
  @AuditRead('Patient', 'patientId')
  @Query(() => [DoseEventModel], { description: "A patient's dose calendar" })
  patientDoseCalendar(
    @Args('patientId', { type: () => ID }) patientId: string,
    @Args('fromDays', { type: () => Int, nullable: true }) fromDays?: number,
    @Args('toDays', { type: () => Int, nullable: true }) toDays?: number,
  ) {
    return this.dosing.calendarFor(patientId, { fromDays, toDays });
  }

  @Authorized('PATIENT')
  @Query(() => DoseSummaryModel, { nullable: true, description: 'The dose the signed-in patient is on and when the next one is due. Null without an active prescription.' })
  myDoseSummary(@CurrentUser() user: AuthUser) {
    return this.dosing.summaryFor(user.id);
  }

  @Authorized('PATIENT')
  @Query(() => MissedDoseStatusModel, { description: 'Whether the signed-in patient should talk to their clinician before their next GLP-1 dose' })
  myMissedDoseStatus(@CurrentUser() user: AuthUser) {
    return this.dosing.missedDoseStatusFor(user.id);
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [MissedDoseAlertModel], { description: 'GLP-1 patients on a stepped-up dose who have not taken several doses in a row — consider re-titrating' })
  missedDoseAlerts() {
    return this.dosing.missedDoseAlerts();
  }

  @Authorized('PATIENT')
  @Mutation(() => DoseEventModel)
  markDoseTaken(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.dosing.markTaken(user.id, id);
  }

  @Authorized('PATIENT')
  @Mutation(() => DoseEventModel, { description: 'Deliberately not taking this dose (e.g. paused by a clinician), as opposed to forgetting it' })
  markDoseSkipped(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string, @Args('note', { nullable: true }) note?: string) {
    return this.dosing.markSkipped(user.id, id, note);
  }

  @Authorized('PATIENT')
  @Mutation(() => DoseEventModel, { description: 'Undo a taken/skipped mark' })
  unmarkDose(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.dosing.unmark(user.id, id);
  }

  @ResolveField(() => ProductModel)
  product(@Parent() event: ParentEvent) {
    return event.prescriptionItem?.product;
  }

  @ResolveField(() => ProductStrengthModel)
  strength(@Parent() event: ParentEvent) {
    return event.prescriptionItem?.strength;
  }
}
