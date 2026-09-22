import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class DeclineConsultationInput {
  @Field(() => ID)
  consultationId: string;

  @Field()
  reason: string;
}
