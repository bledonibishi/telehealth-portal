import { ObjectType, Field, ID } from '@nestjs/graphql';
import { CheckInOutcome, CheckInStatus, ConsultationKind, RedFlagSeverity } from '../../common/enums';
import { QuizAnswerType } from '../../consultations/models/consultation.model';
import { PrescriptionModel } from '../../prescriptions/models/prescription.model';
import { ClinicianModel } from '../../clinicians/models/clinician.model';
import { PatientModel } from '../../patients/models/patient.model';

@ObjectType('CheckInFlag')
export class CheckInFlagModel {
  @Field(() => RedFlagSeverity)
  severity: RedFlagSeverity;

  @Field()
  description: string;
}

@ObjectType('CheckIn')
export class CheckInModel {
  @Field(() => ID)
  id: string;

  @Field(() => CheckInStatus)
  status: CheckInStatus;

  @Field()
  dueAt: Date;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  sentAt?: Date;

  @Field({ nullable: true })
  tokenExpiresAt?: Date;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field({ nullable: true })
  wantsToReorder?: boolean;

  @Field(() => [QuizAnswerType], { nullable: true })
  answers?: QuizAnswerType[];

  @Field({ nullable: true })
  patientFirstName?: string;

  @Field(() => ConsultationKind, { nullable: true })
  kind?: ConsultationKind;

  @Field({ nullable: true })
  questionnaireVersion?: string;

  @Field(() => [CheckInFlagModel], { defaultValue: [] })
  redFlags: CheckInFlagModel[];

  @Field(() => PrescriptionModel, { nullable: true, description: 'The prescription the patient was on when they checked in' })
  prescription?: PrescriptionModel;

  @Field(() => PatientModel, { nullable: true })
  patient?: PatientModel;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field(() => ClinicianModel, { nullable: true })
  reviewedBy?: ClinicianModel;

  @Field(() => CheckInOutcome, { nullable: true })
  outcome?: CheckInOutcome;

  @Field({ nullable: true })
  reviewNote?: string;

  @Field({ nullable: true, description: 'What happened to billing as a result of the review' })
  billingNote?: string;

  @Field({ nullable: true })
  resultOrderId?: string;

  @Field({ nullable: true })
  resultPrescriptionId?: string;

  @Field({ nullable: true, description: 'The link the patient uses to complete their check-in. Only set while a check-in is SENT and awaiting a response.' })
  checkInUrl?: string;
}
