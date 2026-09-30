import { InputType, Field } from '@nestjs/graphql';
import { CheckInFeeling } from '../../common/enums';
import { QuizAnswerInput } from '../../consultations/dto/submit-intake-quiz.input';

@InputType()
export class SubmitCheckInInput {
  @Field(() => [QuizAnswerInput])
  answers: QuizAnswerInput[];

  @Field()
  wantsToReorder: boolean;

  @Field(() => CheckInFeeling, { description: 'How the patient is feeling — shown in their Weight Journey' })
  feeling: CheckInFeeling;
}
