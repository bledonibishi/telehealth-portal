import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class ReviewOnboardingInput {
  @Field(() => ID)
  patientId: string;

  @Field()
  approve: boolean;

  @Field({ nullable: true })
  rejectionReason?: string;
}
