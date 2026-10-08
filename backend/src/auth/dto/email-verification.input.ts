import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class RequestEmailCodeInput {
  @Field()
  email: string;
}

@InputType()
export class VerifyEmailCodeInput {
  @Field()
  email: string;

  @Field({ description: 'The six digits from the email' })
  code: string;
}
