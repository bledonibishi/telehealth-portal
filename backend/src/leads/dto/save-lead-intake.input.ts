import { InputType, Field, ID } from '@nestjs/graphql';
import { QuizAnswerInput } from '../../consultations/dto/submit-intake-quiz.input';

@InputType()
export class SaveLeadIntakeInput {
  @Field(() => ID)
  leadId: string;

  @Field({ description: 'The lead’s email, so a lead id alone can’t be used to overwrite someone’s answers' })
  email: string;

  @Field(() => [QuizAnswerInput])
  answers: QuizAnswerInput[];

  @Field({ description: 'Version of the telehealth consent the visitor accepted (see consentText)' })
  telehealthConsentVersion: string;
}
