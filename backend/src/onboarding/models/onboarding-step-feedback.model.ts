import { ObjectType, Field } from '@nestjs/graphql';
import { OnboardingStepKey } from '../../common/enums';

@ObjectType('OnboardingStepFeedback')
export class OnboardingStepFeedbackModel {
  @Field(() => OnboardingStepKey)
  step: OnboardingStepKey;

  @Field()
  approved: boolean;

  @Field({ nullable: true })
  reason?: string;
}
