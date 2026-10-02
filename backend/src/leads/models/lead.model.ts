import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ConsultationKind, RiskTag } from '../../common/enums';
import { QuizAnswerType } from '../../consultations/models/consultation.model';

@ObjectType('Lead')
export class LeadModel {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field(() => ConsultationKind)
  productKind: ConsultationKind;

  @Field(() => [QuizAnswerType])
  quizAnswers: QuizAnswerType[];

  @Field({ nullable: true })
  stripeSessionId?: string;

  @Field({ nullable: true })
  convertedAt?: Date;

  @Field()
  createdAt: Date;

  @Field(() => RiskTag, { description: 'Triage of the eligibility answers: RED may not continue to plans or payment' })
  riskTag: RiskTag;

  @Field(() => [String], { description: 'Why the tag is RED or ORANGE; empty for GREEN' })
  riskReasons: string[];
}
