import { ObjectType, Field } from '@nestjs/graphql';
import { PatientModel } from './patient.model';
import { CheckInStatus, ConsultationKind, ConsultationStatus } from '../../common/enums';

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
}
