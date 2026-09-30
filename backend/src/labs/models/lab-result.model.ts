import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { LabResultKind } from '../../common/enums';
import { PatientModel } from '../../patients/models/patient.model';
import { ClinicianModel } from '../../clinicians/models/clinician.model';

@ObjectType('LabResult')
export class LabResultModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  patientId: string;

  @Field(() => LabResultKind)
  kind: LabResultKind;

  @Field(() => Float)
  value: number;

  @Field()
  unit: string;

  @Field(() => Float, { nullable: true })
  referenceRangeLow?: number;

  @Field(() => Float, { nullable: true })
  referenceRangeHigh?: number;

  @Field()
  flagged: boolean;

  @Field()
  collectedAt: Date;

  @Field({ nullable: true })
  note?: string;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field({ nullable: true })
  reviewNote?: string;

  @Field(() => PatientModel, { nullable: true })
  patient?: PatientModel;

  @Field(() => ClinicianModel, { nullable: true })
  enteredBy?: ClinicianModel;

  @Field(() => ClinicianModel, { nullable: true })
  reviewedBy?: ClinicianModel;
}
