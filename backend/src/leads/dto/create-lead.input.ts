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

  @Field({ nullable: true })
  stripeSessionId?: string;
}
