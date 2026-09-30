import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { SymptomScale } from '../../common/enums';

@ObjectType('SymptomScaleOption')
export class SymptomScaleOptionModel {
  @Field(() => Int)
  score: number;

  @Field()
  label: string;
}

@ObjectType('SymptomScaleItem')
export class SymptomScaleItemModel {
  @Field()
  id: string;

  @Field()
  text: string;

  @Field()
  domain: string;
}

@ObjectType('SymptomScaleDomain')
export class SymptomScaleDomainModel {
  @Field()
  id: string;

  @Field()
  label: string;
}

@ObjectType('SymptomScaleDefinition', { description: 'A symptom questionnaire, for rendering the form' })
export class SymptomScaleModel {
  @Field(() => SymptomScale)
  id: SymptomScale;

  @Field()
  name: string;

  @Field()
  intro: string;

  @Field(() => [SymptomScaleOptionModel], { description: 'Answer choices, lowest (no symptom) first' })
  options: SymptomScaleOptionModel[];

  @Field(() => [SymptomScaleDomainModel])
  domains: SymptomScaleDomainModel[];

  @Field(() => [SymptomScaleItemModel])
  items: SymptomScaleItemModel[];

  @Field(() => Int)
  minScore: number;

  @Field(() => Int)
  maxScore: number;
}

@ObjectType('SymptomAnswer')
export class SymptomAnswerModel {
  @Field()
  itemId: string;

  @Field(() => Int)
  score: number;
}

@ObjectType('SymptomDomainScore')
export class SymptomDomainScoreModel {
  @Field()
  domain: string;

  @Field()
  label: string;

  @Field(() => Int)
  score: number;

  @Field(() => Int)
  min: number;

  @Field(() => Int)
  max: number;
}

@ObjectType('SymptomAssessment')
export class SymptomAssessmentModel {
  @Field(() => ID)
  id: string;

  @Field(() => SymptomScale)
  scale: SymptomScale;

  @Field()
  recordedAt: Date;

  @Field(() => Int)
  totalScore: number;

  @Field(() => Int)
  minScore: number;

  @Field(() => Int)
  maxScore: number;

  @Field({ description: 'e.g. "Mild", from the scale’s published bands' })
  severity: string;

  @Field(() => [SymptomDomainScoreModel])
  domainScores: SymptomDomainScoreModel[];

  @Field(() => [SymptomAnswerModel])
  answers: SymptomAnswerModel[];
}
