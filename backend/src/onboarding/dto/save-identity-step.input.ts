import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class SaveIdentityStepInput {
  @Field(() => ID, { nullable: true })
  idDocumentFileId?: string;

  @Field(() => ID, { nullable: true })
  selfieFileId?: string;
}
