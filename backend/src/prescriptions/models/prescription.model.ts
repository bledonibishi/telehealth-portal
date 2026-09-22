import { ObjectType, Field, ID } from '@nestjs/graphql';

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
}
