import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ConsultationKind, PaymentMethod } from '../../common/enums';
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

  @Field({ nullable: true })
  selectedPlanId?: string;

  @Field({ nullable: true })
  selectedPlanName?: string;

  @Field(() => PaymentMethod, { nullable: true })
  paymentMethodRequested?: PaymentMethod;

  @Field({ nullable: true })
  paymentRequestedAt?: Date;

  @Field()
  createdAt: Date;
}
