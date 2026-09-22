import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class SendMessageInput {
  @Field(() => ID)
  consultationId: string;

  @Field()
  content: string;
}
