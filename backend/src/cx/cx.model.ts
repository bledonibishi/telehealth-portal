import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';
import { ConsultationKind } from '../common/enums';

/** What the CX team is being asked to do for this person. */
export enum CxTaskKind {
  /** A patient wrote and nobody has answered yet. */
  REPLY = 'REPLY',
  /** Finished the quiz, was eligible, has not paid. */
  LEAD = 'LEAD',
  /** Paid, but has not set a password and signed in. */
  ACTIVATION = 'ACTIVATION',
  /** Signed in, but the ID or photos are unfinished or were sent back. */
  ONBOARDING = 'ONBOARDING',
}
registerEnumType(CxTaskKind, { name: 'CxTaskKind' });

@ObjectType()
export class CxTask {
  @Field(() => ID, { description: 'The kind and the person, e.g. REPLY:<patientId>' })
  id: string;

  @Field(() => CxTaskKind)
  kind: CxTaskKind;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  phone?: string;

  @Field(() => ConsultationKind, { nullable: true })
  programme?: ConsultationKind;

  @Field({ description: 'Since when this has been waiting' })
  since: Date;

  @Field(() => ID, { nullable: true })
  patientId?: string;

  @Field(() => ID, { nullable: true })
  leadId?: string;

  @Field({ description: 'ONBOARDING only: the doctor sent a step back to be done again' })
  sentBack: boolean;

  @Field({ nullable: true, description: 'LEAD only: when someone on the team last got in touch' })
  lastContactedAt?: Date;

  @Field({ nullable: true, description: 'LEAD only: who that was' })
  lastContactedBy?: string;
}

@ObjectType()
export class CxWorkQueue {
  @Field(() => [CxTask], { description: 'Everything waiting for the CX team, longest wait first' })
  tasks: CxTask[];

  @Field(() => Int, { description: 'Leads from the last 7 days' })
  leadsThisWeek: number;

  @Field(() => Int, { description: 'Of those, how many have paid' })
  paidThisWeek: number;

  @Field(() => Int, { description: 'Patients who activated their account in the last 7 days' })
  activatedThisWeek: number;
}
