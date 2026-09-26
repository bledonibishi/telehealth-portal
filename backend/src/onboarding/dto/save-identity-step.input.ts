import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class SaveIdentityStepInput {
  @Field(() => ID)
  idDocumentFileId: string;

  @Field(() => ID)
  selfieFileId: string;
}
