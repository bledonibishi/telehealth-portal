import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
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

@ObjectType('ReturnOffer', { description: 'A refunded patient whose prescription is still valid: what they can order without a second prescription fee' })
export class ReturnOfferModel {
  @Field({ description: 'The last day the prescription can be dispensed' })
  until: Date;

  @Field({ nullable: true, description: 'What the prescription is for, e.g. "Oestrogel 0.75 mg per pump"' })
  treatment?: string | null;

  @Field(() => Int, { nullable: true, description: 'The invoice total before any account credit; the amount due is lower when a voucher was already applied' })
  totalCents?: number | null;

  @Field(() => Int, { description: 'Vouchers they have not applied yet' })
  unusedVoucherCents: number;

  @Field({ nullable: true, description: 'To pay inside our own page with Stripe\'s payment form; null when only the hosted link is available' })
  clientSecret?: string | null;

  @Field({ nullable: true, description: 'Where to pay; null when it could not be made (it is emailed instead)' })
  payUrl?: string | null;

  @Field(() => Int, { nullable: true })
  amountCents?: number | null;

  @Field({ nullable: true })
  currency?: string | null;
}

@ObjectType('ReturnSubscription', { description: 'The subscription payment for a refunded patient coming back to their prescription' })
export class ReturnSubscriptionModel {
  @Field({ description: 'To take the first month inside our own page with Stripe\'s payment form' })
  clientSecret: string;

  @Field(() => Int, { description: 'Due today, after any account credit' })
  amountDueCents: number;

  @Field(() => Int, { description: 'The first month before any account credit' })
  totalCents: number;

  @Field()
  currency: string;
}
