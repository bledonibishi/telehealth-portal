import { InputType, Field, ID } from '@nestjs/graphql';
import { OnboardingStepKey } from '../../common/enums';

@InputType()
export class ReviewOnboardingStepInput {
  @Field(() => ID)
  patientId: string;

  @Field(() => OnboardingStepKey)
  step: OnboardingStepKey;

  @Field()
  approved: boolean;

  @Field({ nullable: true })
  reason?: string;
}
