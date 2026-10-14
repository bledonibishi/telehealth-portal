import { Args, Field, ID, InputType, Mutation, ObjectType, Query, Resolver, registerEnumType } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';
import { SupportAction, SupportActionsService } from './support-actions.service';

registerEnumType(SupportAction, { name: 'SupportAction' });

@InputType()
export class PerformSupportActionInput {
  @Field(() => ID)
  patientId: string;

  @Field(() => SupportAction)
  action: SupportAction;

  @Field({ description: 'Why it is being done; kept in the audit log' })
  reason: string;

  @Field(() => ID, { nullable: true, description: 'The ticket this is for; a note is added to it' })
  ticketId?: string;
}

@ObjectType('SupportActionResult')
class SupportActionResultModel {
  @Field()
  ok: boolean;

  @Field({ description: 'What happened, in words for the person who pressed the button' })
  message: string;
}

@ObjectType('SupportActionState')
class SupportActionStateModel {
  @Field(() => SupportAction)
  action: SupportAction;

  @Field({ description: 'False when it makes no sense for this patient right now' })
  available: boolean;

  @Field({ nullable: true, description: 'Why it is not available, in words for the team' })
  unavailableReason?: string;

  @Field({ nullable: true, description: 'While the same action was done a moment ago: when it can be done again' })
  cooldownUntil?: Date;
}

@ObjectType('SupportActionHistory')
class SupportActionHistoryModel {
  @Field(() => ID)
  id: string;

  @Field(() => SupportAction)
  action: SupportAction;

  @Field()
  at: Date;

  @Field()
  byName: string;

  @Field()
  ok: boolean;

  @Field()
  outcome: string;

  @Field()
  reason: string;
}

@ObjectType('SupportActionContext')
class SupportActionContextModel {
  @Field()
  patientName: string;

  @Field()
  email: string;

  @Field({ description: 'Whether the patient has set a password and opened their account' })
  activated: boolean;

  @Field()
  hasPaymentProfile: boolean;

  @Field(() => [SupportActionStateModel])
  actions: SupportActionStateModel[];

  @Field(() => [SupportActionHistoryModel], { description: 'Quick fixes already done for this patient, newest first' })
  history: SupportActionHistoryModel[];
}

@Resolver()
export class SupportActionsResolver {
  constructor(private actions: SupportActionsService) {}

  // Support and admins only: doctors have their own tools, and the pharmacy never touches a patient's account.
  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM)
  @Mutation(() => SupportActionResultModel, { description: 'Does by hand something the automatic process should have done; always audited' })
  performSupportAction(@CurrentUser() user: AuthUser, @Args('input') input: PerformSupportActionInput) {
    return this.actions.perform(user, input);
  }

  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM)
  @Query(() => SupportActionContextModel, { description: 'What applies to this patient before a quick fix is used, and what was already done' })
  supportActionContext(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.actions.context(patientId);
  }
}
