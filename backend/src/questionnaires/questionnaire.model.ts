import { ObjectType, Field, Int, Float, registerEnumType } from '@nestjs/graphql';
import { ConsultationKind } from '../common/enums';

export enum QuestionnaireStageEnum {
  ELIGIBILITY = 'ELIGIBILITY',
  INTAKE = 'INTAKE',
  CHECKIN = 'CHECKIN',
}
registerEnumType(QuestionnaireStageEnum, { name: 'QuestionnaireStage' });

export enum QuestionTypeEnum {
  single = 'single',
  multi = 'multi',
  number = 'number',
  text = 'text',
}
registerEnumType(QuestionTypeEnum, { name: 'QuestionType' });

// Presentation only — the flags each option raises stay on the server.
@ObjectType('QuestionOption')
export class QuestionOptionModel {
  @Field()
  value: string;

  @Field()
  label: string;

  @Field({ defaultValue: false })
  exclusive: boolean;
}

@ObjectType('QuestionCondition')
export class QuestionConditionModel {
  @Field()
  questionId: string;

  @Field(() => [String])
  anyOf: string[];
}

@ObjectType('Question')
export class QuestionModel {
  @Field()
  id: string;

  @Field()
  text: string;

  @Field({ nullable: true })
  help?: string;

  @Field(() => QuestionTypeEnum)
  type: QuestionTypeEnum;

  @Field({ defaultValue: false })
  optional: boolean;

  @Field(() => [QuestionOptionModel], { nullable: true })
  options?: QuestionOptionModel[];

  @Field(() => Float, { nullable: true })
  min?: number;

  @Field(() => Float, { nullable: true })
  max?: number;

  @Field({ nullable: true })
  unit?: string;

  @Field({ nullable: true, description: 'Text questions: a ready answer to offer as one tap, e.g. “None”' })
  quickAnswer?: string;

  @Field(() => QuestionConditionModel, { nullable: true, description: 'Ask only when an earlier answer has one of these values' })
  showIf?: QuestionConditionModel;
}

@ObjectType('Questionnaire')
export class QuestionnaireModel {
  @Field(() => ConsultationKind)
  kind: ConsultationKind;

  @Field(() => QuestionnaireStageEnum)
  stage: QuestionnaireStageEnum;

  @Field(() => Int)
  version: number;

  @Field()
  title: string;

  @Field(() => [QuestionModel])
  questions: QuestionModel[];
}
