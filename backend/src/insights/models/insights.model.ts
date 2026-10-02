import { ObjectType, Field, Float, Int, ID, registerEnumType } from '@nestjs/graphql';

@ObjectType('MrrAmount')
export class MrrAmountModel {
  @Field()
  currency: string;

  @Field(() => Int, { description: 'In the smallest currency unit (cents)' })
  amountCents: number;
}

@ObjectType('RevenueOverview')
export class RevenueOverviewModel {
  @Field({ description: 'False when Stripe is not set up, in which case every figure is zero' })
  configured: boolean;

  @Field(() => Int)
  periodDays: number;

  @Field()
  asOf: Date;

  @Field(() => Int)
  activeSubscribers: number;

  @Field(() => Int, { description: 'Subscribers whose last payment failed' })
  pastDueSubscribers: number;

  @Field(() => [MrrAmountModel], { description: 'Monthly recurring revenue per currency, from list prices before discounts' })
  mrr: MrrAmountModel[];

  @Field(() => Int)
  newSubscribers: number;

  @Field(() => Int, { description: 'Every subscription that ended in the period' })
  cancellations: number;

  @Field(() => Int, { description: 'Of those, how many were a clinician declining the patient (refunded) rather than the patient leaving' })
  clinicalDeclines: number;

  @Field(() => Float, { nullable: true, description: 'Patients who left, as a percentage of those subscribed at the start of the period' })
  churnRate?: number;

  @Field({ description: 'True when there were more subscriptions than one request reads, so the figures are partial' })
  truncated: boolean;

  @Field({ nullable: true, description: 'Set when Stripe is set up but refused the request, e.g. a wrong API key' })
  error?: string;
}

export enum FunnelStageKey {
  QUIZ_COMPLETED = 'QUIZ_COMPLETED',
  PAID = 'PAID',
  ACCOUNT_ACTIVATED = 'ACCOUNT_ACTIVATED',
  CONSULTATION_SUBMITTED = 'CONSULTATION_SUBMITTED',
  DOCTOR_APPROVED = 'DOCTOR_APPROVED',
  FIRST_SHIPMENT = 'FIRST_SHIPMENT',
}
registerEnumType(FunnelStageKey, { name: 'FunnelStageKey' });

@ObjectType('FunnelStage')
export class FunnelStageModel {
  @Field(() => FunnelStageKey)
  key: FunnelStageKey;

  @Field(() => Int)
  count: number;

  @Field(() => Float, { nullable: true })
  percentOfPrevious?: number;

  @Field(() => Float, { nullable: true })
  percentOfFirst?: number;
}

@ObjectType('SalesFunnel')
export class SalesFunnelModel {
  @Field(() => Int)
  periodDays: number;

  @Field(() => [FunnelStageModel])
  stages: FunnelStageModel[];
}

export enum ClinicianActivity {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
registerEnumType(ClinicianActivity, { name: 'ClinicianActivity' });

@ObjectType('ClinicianPerformance')
export class ClinicianPerformanceModel {
  @Field(() => ID)
  clinicianId: string;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  role: string;

  @Field()
  isVerified: boolean;

  @Field(() => ClinicianActivity, { description: 'ACTIVE when they decided a case, prescribed, reviewed a check-in or hold an open case in the period' })
  status: ClinicianActivity;

  @Field(() => Int)
  casesDecided: number;

  @Field(() => Int)
  approved: number;

  @Field(() => Int)
  declined: number;

  @Field(() => Int)
  moreInfoRequests: number;

  @Field(() => Float, { nullable: true })
  approvalRate?: number;

  @Field(() => Float, { nullable: true, description: 'Minutes from the patient submitting to the doctor deciding' })
  avgDecisionMinutes?: number;

  @Field(() => Float, { nullable: true })
  medianDecisionMinutes?: number;

  @Field(() => Int)
  prescriptionsIssued: number;

  @Field(() => Int)
  checkInsReviewed: number;

  @Field(() => Int, { description: 'Consultations they have claimed and not yet decided' })
  openCases: number;
}
