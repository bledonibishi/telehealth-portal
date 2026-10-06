import { Field, ID, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';
import { BodyPhotoView, PhotoCheckOutcome } from '@prisma/client';

registerEnumType(BodyPhotoView, { name: 'BodyPhotoView' });
registerEnumType(PhotoCheckOutcome, { name: 'PhotoCheckOutcome', description: 'UNCHECKED: the automated check could not run, so a clinician reviews the photo as usual' });
export { BodyPhotoView, PhotoCheckOutcome };

@InputType()
export class SaveBodyPhotoInput {
  @Field(() => BodyPhotoView)
  view: BodyPhotoView;

  @Field(() => ID)
  fileId: string;

  @Field({ nullable: true, description: 'Keep a photo that failed the check, for a clinician to review. Only after repeated failures.' })
  sendForReview?: boolean;
}

@ObjectType('BodyPhotoCheckResult')
export class BodyPhotoCheckResultModel {
  @Field(() => PhotoCheckOutcome)
  outcome: PhotoCheckOutcome;

  @Field(() => [String], { description: 'Codes for what is wrong, for the app to react to (e.g. "NOT_FULL_BODY")' })
  issues: string[];

  @Field(() => [String], { description: 'What to tell the patient, one sentence per issue' })
  messages: string[];

  @Field({ description: 'After repeated failures: the patient may send this photo for a clinician to review instead of retaking it' })
  canSendForReview: boolean;
}

@ObjectType('PhotoFrameResult', { description: 'Live guidance on one camera frame. Not stored.' })
export class PhotoFrameResultModel {
  @Field({ description: 'False when there is no guidance to give (not set up, rate limited, an outage): show none' })
  available: boolean;

  @Field({ description: 'The photo would pass if it were taken now' })
  ready: boolean;

  @Field(() => [String], { description: 'What to fix, one sentence each' })
  messages: string[];
}

@ObjectType('BodyPhotoCheckSummary', { description: 'What the automated check made of a saved photo, for the clinician reviewing it' })
export class BodyPhotoCheckSummaryModel {
  @Field(() => BodyPhotoView)
  view: BodyPhotoView;

  @Field(() => PhotoCheckOutcome)
  outcome: PhotoCheckOutcome;

  @Field(() => [String])
  issues: string[];

  @Field()
  checkedAt: Date;
}
