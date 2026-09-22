import { InputType, Field } from '@nestjs/graphql';
import { ConsultationKind } from '../../common/enums';

@InputType()
export class QuizAnswerInput {
  @Field()
  questionId: string;

  @Field()
  question: string;

  @Field()
  answer: string;
}

@InputType()
export class SubmitIntakeQuizInput {
  @Field(() => ConsultationKind)
  kind: ConsultationKind;

  @Field(() => [QuizAnswerInput])
  answers: QuizAnswerInput[];
}
