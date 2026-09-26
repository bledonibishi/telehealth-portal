import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class SaveBodyPhotosStepInput {
  @Field(() => ID)
  bodyPhotoFrontFileId: string;

  @Field(() => ID)
  bodyPhotoSideFileId: string;
}
