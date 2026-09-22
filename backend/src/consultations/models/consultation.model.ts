import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ConsultationStatus, ConsultationKind, RedFlagSeverity } from '../../common/enums';
import { ClinicianModel } from '../../clinicians/models/clinician.model';
import { PatientModel } from '../../patients/models/patient.model';
import { PrescriptionModel } from '../../prescriptions/models/prescription.model';
import { MessageModel } from '../../messaging/models/message.model';

@ObjectType('RedFlag')
export class RedFlagModel {
  @Field(() => ID)
  id: string;

  @Field()
  description: string;

  @Field(() => RedFlagSeverity)
  severity: RedFlagSeverity;

  @Field()
  createdAt: Date;
}

@ObjectType('Consultation')
export class ConsultationModel {
  @Field(() => ID)
  id: string;

  @Field(() => ConsultationKind)
  kind: ConsultationKind;

  @Field(() => ConsultationStatus)
  status: ConsultationStatus;

  @Field(() => PatientModel)
  patient: PatientModel;

  @Field(() => ClinicianModel, { nullable: true })
  clinician?: ClinicianModel;

  @Field(() => [RedFlagModel])
  redFlags: RedFlagModel[];

  @Field(() => PrescriptionModel, { nullable: true })
  prescription?: PrescriptionModel;

  @Field(() => [MessageModel])
  messages: MessageModel[];

  @Field()
  submittedAt: Date;

  @Field()
  updatedAt: Date;
}
