import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ConsultationModel } from '../../consultations/models/consultation.model';
import { CheckInModel } from '../../check-ins/models/check-in.model';

@ObjectType('Patient')
export class PatientModel {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  dateOfBirth: Date;

  @Field({ nullable: true })
  leadId?: string;

  @Field({ nullable: true })
  activatedAt?: Date;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  addressLine1?: string;

  @Field({ nullable: true })
  addressLine2?: string;

  @Field({ nullable: true })
  city?: string;

  @Field({ nullable: true })
  postcode?: string;

  @Field({ nullable: true })
  country?: string;

  @Field()
  createdAt: Date;

  @Field(() => [ConsultationModel])
  consultations: ConsultationModel[];

  @Field(() => [CheckInModel])
  checkIns: CheckInModel[];
}
