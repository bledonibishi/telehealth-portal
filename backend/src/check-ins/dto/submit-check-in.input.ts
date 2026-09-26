import { InputType, Field } from '@nestjs/graphql';
import { QuizAnswerInput } from '../../consultations/dto/submit-intake-quiz.input';

@InputType()
export class SubmitCheckInInput {
  @Field(() => [QuizAnswerInput])
  answers: QuizAnswerInput[];

  @Field()
  wantsToReorder: boolean;
}
