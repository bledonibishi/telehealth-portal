import { InputType, Field } from '@nestjs/graphql';
import { ConsultationKind } from '../../common/enums';

@InputType()
export class PreviousAssessmentInput {
  @Field()
  email: string;

  @Field(() => ConsultationKind, { description: 'The treatment the quiz being taken now is for: answers saved for another treatment are not offered' })
  productKind: ConsultationKind;

  @Field({ description: 'The proof from verifyEmailCode' })
  emailVerificationToken: string;
}
