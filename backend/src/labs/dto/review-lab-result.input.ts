import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class ReviewLabResultInput {
  @Field(() => ID)
  labResultId: string;

  @Field({ nullable: true })
  reviewNote?: string;
}
