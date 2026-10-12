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

  @Field({ description: 'Last time anything on the lead changed, e.g. when they came back and redid the quiz' })
  updatedAt: Date;

  @Field({ nullable: true, description: 'When they answered the health questions on the website' })
  intakeSavedAt?: Date;

  @Field({ nullable: true })
  referralCode?: string;

  @Field({ description: 'How far they got: QUIZ, HEALTH_ANSWERED, AT_CHECKOUT or PAID' })
  stage: string;

  @Field({ nullable: true, description: 'The treatment they chose, when they chose one' })
  treatment?: string;

  @Field({ nullable: true, description: 'Delivery city entered at checkout' })
  deliveryCity?: string;

  @Field({ nullable: true, description: 'Delivery country entered at checkout' })
  deliveryCountry?: string;

  @Field({ description: 'Reminder emails sent to this lead so far' })
  reminderCount: number;

  @Field({ nullable: true, description: 'Set when the lead asked not to get any more reminders' })
  remindersStoppedAt?: Date;
}

@ObjectType('PreviousAssessment')
export class PreviousAssessmentModel {
  @Field(() => ConsultationKind)
  productKind: ConsultationKind;

  @Field({ description: 'When these answers were last saved' })
  savedAt: Date;

  @Field({ nullable: true, description: 'When the health answers were saved' })
  healthSavedAt?: Date;

  @Field(() => [QuizAnswerType], { description: 'The eligibility answers they gave before' })
  eligibility: QuizAnswerType[];

  @Field(() => [QuizAnswerType], { description: 'The health answers they gave before' })
  health: QuizAnswerType[];

  @Field({ description: 'Whether they may go on with these answers instead of today’s' })
  canKeep: boolean;

  @Field({ nullable: true, description: 'Why not, when they may not' })
  keepBlockedReason?: string;
}
