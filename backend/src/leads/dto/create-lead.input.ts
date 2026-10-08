import { InputType, Field } from '@nestjs/graphql';
import { ConsultationKind } from '../../common/enums';
import { QuizAnswerInput } from '../../consultations/dto/submit-intake-quiz.input';

@InputType()
export class CreateLeadInput {
  @Field()
  email: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field(() => ConsultationKind)
  productKind: ConsultationKind;

  @Field(() => [QuizAnswerInput])
  quizAnswers: QuizAnswerInput[];

  @Field(() => [QuizAnswerInput], { nullable: true, description: 'Answers to the medical questionnaire, asked in the same quiz; checked here and kept until the first payment makes them the consultation' })
  intakeAnswers?: QuizAnswerInput[];

  @Field({ nullable: true, description: 'Version of the telehealth consent accepted with them (see consentText). Required with intakeAnswers' })
  telehealthConsentVersion?: string;

  @Field({ nullable: true })
  stripeSessionId?: string;

  @Field({ nullable: true, description: "A referrer's shareable code, carried through from the quiz link" })
  referralCode?: string;
}
