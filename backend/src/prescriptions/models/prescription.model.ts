import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ConsultationModel } from '../../consultations/models/consultation.model';

@ObjectType('Prescription')
export class PrescriptionModel {
  @Field(() => ID)
  id: string;

  @Field()
  consultationId: string;

  @Field()
  medication: string;

  @Field()
  dosage: string;

  @Field()
  instructions: string;

  @Field()
  issuedAt: Date;

  @Field({ nullable: true })
  pharmacyRef?: string;

  @Field({ nullable: true })
  dispatchedAt?: Date;

  @Field({ nullable: true })
  carrier?: string;

  @Field({ nullable: true })
  trackingNumber?: string;

  @Field({ nullable: true })
  trackingUrl?: string;

  @Field({ nullable: true })
  outForDeliveryAt?: Date;

  @Field({ nullable: true })
  deliveredAt?: Date;

  @Field(() => ConsultationModel, { nullable: true })
  consultation?: ConsultationModel;
}
