import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class SymptomAnswerInput {
  @Field()
  itemId: string;

  @Field(() => Int)
  score: number;
}

@InputType()
export class RecordSymptomsInput {
  @Field(() => [SymptomAnswerInput], { description: 'One answer per item of the patient’s scale' })
  answers: SymptomAnswerInput[];
}
