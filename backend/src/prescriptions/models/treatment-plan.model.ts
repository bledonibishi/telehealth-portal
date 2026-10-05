import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { ConsultationKind } from '../../common/enums';

@ObjectType('TreatmentPlan', { description: 'The signed-in patient’s current treatment, for the dashboard and the plan page' })
export class TreatmentPlanModel {
  @Field(() => ID)
  prescriptionId: string;

  @Field(() => ConsultationKind, { nullable: true })
  kind?: ConsultationKind | null;

  @Field({ description: 'e.g. "GLP-1 Weight Loss Program"' })
  programme: string;

  @Field({ description: 'e.g. "Wegovy"' })
  productName: string;

  @Field({ nullable: true, description: 'e.g. "Semaglutide"' })
  genericName?: string | null;

  @Field({ nullable: true, description: 'e.g. "0.5 mg"' })
  strength?: string | null;

  @Field({ nullable: true, description: '1 is the starting dose' })
  titrationStep?: number | null;

  @Field({ description: 'e.g. "Once a week"' })
  frequency: string;

  @Field(() => Float, { nullable: true })
  dosesPerWeek?: number | null;

  @Field({ nullable: true })
  directions?: string | null;

  @Field({ nullable: true })
  prescriberName?: string | null;

  @Field({ description: 'When the patient started this programme (the first prescription in the chain)' })
  startedAt: Date;

  @Field({ nullable: true, description: 'When the current prescription runs out' })
  validUntil?: Date | null;

  @Field(() => Int, { nullable: true, description: 'From the start to when the prescription runs out' })
  durationWeeks?: number | null;

  @Field(() => Int)
  weeksElapsed: number;

  @Field(() => Int)
  dosesTaken: number;

  @Field(() => Int, { nullable: true, description: 'How many doses the whole plan holds, when it has an end date' })
  dosesPlanned?: number | null;

  @Field(() => Int, { nullable: true, description: 'Doses in the supply the patient has now; null before the first one ships' })
  supplyDosesTotal?: number | null;

  @Field(() => Int, { nullable: true })
  supplyDosesTaken?: number | null;

  @Field({ nullable: true })
  nextDoseAt?: Date | null;

  @Field(() => Int)
  repeatsLeft: number;
}
