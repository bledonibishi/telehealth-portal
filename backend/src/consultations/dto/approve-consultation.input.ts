import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class ApproveConsultationInput {
  @Field(() => ID)
  consultationId: string;

  @Field()
  medication: string;

  @Field()
  dosage: string;

  @Field()
  instructions: string;
}
