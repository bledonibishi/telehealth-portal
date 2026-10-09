import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class RequestActivationLinkInput {
  @Field()
  email: string;
}

@InputType()
export class RequestPasswordResetInput {
  @Field()
  email: string;
}

@InputType()
export class ResetPasswordInput {
  @Field()
  token: string;

  @Field()
  newPassword: string;
}

@InputType()
export class ActivateAccountInput {
  @Field()
  token: string;

  @Field()
  password: string;
}
