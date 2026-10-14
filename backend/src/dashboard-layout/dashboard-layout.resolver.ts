import { Args, Field, ID, InputType, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { DashboardLayoutService } from './dashboard-layout.service';
import type { DashboardLayout, DashboardSize } from '@telehealth/shared-types';
import { ClinicianRole } from '../common/enums';

@ObjectType('DashboardWidgetSize')
export class DashboardWidgetSizeModel {
  @Field() id: string;
  @Field() size: string;
}

@InputType()
export class DashboardWidgetSizeInput {
  @Field() id: string;
  @Field() size: string;
}

@ObjectType('DashboardStaffHold')
export class DashboardStaffHoldModel {
  @Field() id: string;
  @Field({ description: 'When the hold ends' }) until: string;
}

@ObjectType('DashboardLayout')
export class DashboardLayoutModel {
  @Field(() => [String]) top: string[];
  @Field(() => [String]) main: string[];
  @Field(() => [String]) side: string[];
  @Field(() => [String], { description: 'Cards the patient has taken off' }) hidden: string[];
  @Field(() => [DashboardWidgetSizeModel], { description: 'The size of each card the patient has resized' }) sizes: DashboardWidgetSizeModel[];
  @Field(() => [DashboardStaffHoldModel], { description: 'Cards support is hiding for now, and until when' }) staffHidden: DashboardStaffHoldModel[];
}

@ObjectType('PatientDashboardCard')
export class PatientDashboardCardModel {
  @Field() id: string;
  @Field() title: string;
  @Field({ description: 'SHOWING, HIDDEN_BY_PATIENT, HIDDEN_BY_SUPPORT or SHOWN_BY_SUPPORT' }) state: string;
  @Field({ description: 'Whether support may hide it at all' }) canHide: boolean;
  @Field(() => String, { nullable: true }) until: string | null;
  @Field(() => String, { nullable: true }) reason: string | null;
}

@InputType()
export class DashboardHoldInput {
  @Field(() => ID) patientId: string;
  @Field() cardId: string;
  @Field({ description: 'HIDE, SHOW or CLEAR' }) action: string;
  @Field(() => Int, { nullable: true, description: 'How many days it lasts (1 to 30), for HIDE and SHOW' }) days?: number;
  @Field({ nullable: true }) reason?: string;
}

@InputType()
export class DashboardLayoutInput {
  @Field(() => [String], { nullable: true }) top?: string[];
  @Field(() => [String], { nullable: true }) main?: string[];
  @Field(() => [String], { nullable: true }) side?: string[];
  @Field(() => [String], { nullable: true }) hidden?: string[];
  @Field(() => [DashboardWidgetSizeInput], { nullable: true }) sizes?: DashboardWidgetSizeInput[];
}

// The stored layout keeps sizes as { id: size }; the API sends them as a list.
const toApi = (l: DashboardLayout & { staffHidden?: Array<{ id: string; until: string }> }) => ({ ...l, sizes: Object.entries(l.sizes).map(([id, size]) => ({ id, size })), staffHidden: l.staffHidden ?? [] });

@Resolver()
export class DashboardLayoutResolver {
  constructor(private layouts: DashboardLayoutService) {}

  @Authorized('PATIENT')
  @Query(() => DashboardLayoutModel, { description: 'How the patient has arranged the cards on their home screen' })
  myDashboardLayout(@CurrentUser() user: AuthUser) {
    return this.layouts.getForPatient(user.id).then(toApi);
  }

  @Authorized('PATIENT')
  @Mutation(() => DashboardLayoutModel, { description: 'Saves the arrangement; cards that must always be shown cannot be taken off' })
  saveMyDashboardLayout(@CurrentUser() user: AuthUser, @Args('input') input: DashboardLayoutInput) {
    const sizes = Object.fromEntries((input.sizes ?? []).map((s) => [s.id, s.size as DashboardSize]));
    return this.layouts.save(user.id, { ...input, sizes }).then(toApi);
  }

  @Authorized('PATIENT')
  @Mutation(() => DashboardLayoutModel, { description: 'Back to the app’s own arrangement' })
  resetMyDashboardLayout(@CurrentUser() user: AuthUser) {
    return this.layouts.reset(user.id).then(toApi);
  }

  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM)
  @Query(() => [PatientDashboardCardModel], { description: 'For support: every home-screen card of one patient and whether it is showing' })
  patientDashboardCards(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.layouts.cardsFor(patientId);
  }

  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM)
  @Mutation(() => [PatientDashboardCardModel], { description: 'Support hides a card for a while, shows one the patient took off, or lifts an earlier hold; always audited, always ends by itself' })
  setPatientDashboardCard(@CurrentUser() user: AuthUser, @Args('input') input: DashboardHoldInput) {
    return this.layouts.setHold(user, input.patientId, { cardId: input.cardId, action: input.action as 'HIDE' | 'SHOW' | 'CLEAR', days: input.days, reason: input.reason });
  }
}
