import { ObjectType, Field, Float, registerEnumType } from '@nestjs/graphql';
import { PatientModel } from './patient.model';
import { CheckInStatus, ConsultationKind, ConsultationStatus } from '../../common/enums';

export enum PatientTreatmentStatus {
  /** Activated their account and has a current prescription */
  ACTIVE = 'ACTIVE',
  /** Activated, but no current prescription (not started, or stopped) */
  INACTIVE = 'INACTIVE',
  /** Has not activated their account yet */
  PENDING = 'PENDING',
}
registerEnumType(PatientTreatmentStatus, { name: 'PatientTreatmentStatus' });

@ObjectType('PatientMedication')
export class PatientMedicationModel {
  @Field({ description: 'The brand when there is one (Mounjaro, Wegovy…), otherwise the medicine name' })
  label: string;

  @Field({ nullable: true, description: 'The dose / strength currently prescribed' })
  dose?: string;
}

// Everything PatientModel has, plus a handful of pre-computed summary fields
// so the patients list can filter and sort without loading each patient's
// full consultation/prescription/check-in history.
@ObjectType('PatientListItem')
export class PatientListItemModel extends PatientModel {
  @Field(() => ConsultationKind, { nullable: true, description: 'The programme this patient signed up for' })
  productKind?: ConsultationKind;

  @Field(() => ConsultationStatus, { nullable: true, description: 'Status of their most recent consultation' })
  latestConsultationStatus?: ConsultationStatus;

  @Field({ description: 'Has a currently active prescription' })
  hasActivePrescription: boolean;

  @Field(() => CheckInStatus, { nullable: true })
  lastCheckInStatus?: CheckInStatus;

  @Field({ nullable: true, description: 'When their most recent check-in is/was due' })
  lastCheckInDueAt?: Date;

  @Field(() => PatientTreatmentStatus)
  treatmentStatus: PatientTreatmentStatus;

  @Field(() => [PatientMedicationModel], { description: 'What the current prescription is for, one entry per item' })
  medications: PatientMedicationModel[];

  @Field(() => Float, { nullable: true, description: 'Weight programmes only — same numbers as the patient’s own dashboard' })
  startingWeightKg?: number;

  @Field(() => Float, { nullable: true })
  currentWeightKg?: number;

  @Field(() => Float, { nullable: true })
  targetWeightKg?: number;

  @Field(() => Float, { nullable: true, description: 'Null until a target weight is set' })
  weightLostKg?: number;

  @Field(() => Float, { nullable: true, description: 'From their profile, or the intake answer until they set it' })
  heightCm?: number | null;

  @Field(() => Float, { nullable: true, description: 'Current weight over height squared. Null without a believable height and weight.' })
  bmi?: number | null;

  @Field(() => Float, { nullable: true, description: '0–100; null until a target weight is set' })
  progressPercentage?: number;

  @Field({ nullable: true, description: 'Their most recent weighing (daily entry or monthly check-in)' })
  lastWeighedAt?: Date;

  @Field({ description: 'Their newest message has no reply from staff yet' })
  awaitingReply: boolean;

  @Field({ nullable: true, description: 'When the patient last sent a message' })
  lastMessageAt?: Date;
}
