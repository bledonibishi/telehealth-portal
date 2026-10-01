import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class RequestActivationLinkInput {
  @Field()
  email: string;
}

@InputType()
export class ActivateAccountInput {
  @Field()
  token: string;

  @Field()
  password: string;
}
