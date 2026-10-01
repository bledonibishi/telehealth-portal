import { InputType, Field } from '@nestjs/graphql';
import { ConsultationKind } from '../../common/enums';

@InputType()
export class QuizAnswerInput {
  @Field()
  questionId: string;

  @Field({ nullable: true, description: 'Ignored by the server, which uses its own wording; kept for older clients' })
  question?: string;

  @Field({ description: 'Display text: the chosen option label(s), number or free text' })
  answer: string;

  @Field({ nullable: true, description: "Option value(s) from the questionnaire, '|'-separated for multi-select" })
  value?: string;
}

@InputType()
export class SubmitIntakeQuizInput {
  @Field(() => ConsultationKind)
  kind: ConsultationKind;

  @Field(() => [QuizAnswerInput])
  answers: QuizAnswerInput[];

  @Field({ nullable: true, description: 'Version of the telehealth consent the patient accepted (see consentText)' })
  telehealthConsentVersion?: string;
}
