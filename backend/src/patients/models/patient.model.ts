import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ConsultationModel } from '../../consultations/models/consultation.model';

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

  @Field()
  createdAt: Date;

  @Field(() => [ConsultationModel])
  consultations: ConsultationModel[];
}
