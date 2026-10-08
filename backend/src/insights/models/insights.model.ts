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
  LANDING_VISITORS = 'LANDING_VISITORS',
  QUIZ_STARTED = 'QUIZ_STARTED',
  PASSED_ELIGIBILITY = 'PASSED_ELIGIBILITY',
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

  @Field({ description: 'False when PostHog is not connected, so the visitor and quiz-start stages are left out' })
  visitorsConfigured: boolean;

  @Field({ nullable: true, description: 'Set when PostHog is connected but refused the request, e.g. a wrong key' })
  visitorsError?: string;
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

@ObjectType('MonthRow')
export class MonthRowModel {
  @Field({ description: '"2026-10"' })
  month: string;

  @Field(() => Int, { description: 'Quiz completions' })
  newLeads: number;

  @Field(() => Int, { description: 'Patients who activated their account' })
  newPatients: number;

  @Field(() => Int)
  subscriptionsEnded: number;

  @Field(() => Int)
  ordersDispatched: number;

  @Field(() => Int)
  checkInsReviewed: number;

  @Field(() => Int, { description: 'Reviews that sent a repeat or a new prescription' })
  continued: number;

  @Field(() => Int)
  held: number;

  @Field(() => Int)
  stopped: number;

  @Field(() => [MrrAmountModel], { description: 'Collected in the month per currency, before refunds' })
  revenue: MrrAmountModel[];

  @Field(() => Int, { description: 'Weight-programme patients with a check-in this month and a known starting weight' })
  weighedPatients: number;

  @Field(() => Float, { nullable: true, description: 'Average share of starting weight lost, at each patient’s last check-in of the month' })
  avgLossPct?: number | null;

  @Field(() => Float, { nullable: true, description: 'Share of those patients who had lost at least 5% of their starting weight' })
  successRatePct?: number | null;
}

@ObjectType('MonthlyReport')
export class MonthlyReportModel {
  @Field({ description: 'False when Stripe is not set up, so revenue is empty' })
  revenueConfigured: boolean;

  @Field(() => String, { nullable: true, description: 'Set when Stripe is set up but refused the request' })
  revenueError?: string | null;

  @Field({ description: 'True when Stripe had more invoices than one request reads, so the oldest months may be short' })
  revenueTruncated: boolean;

  @Field(() => [MonthRowModel], { description: 'Newest month first' })
  months: MonthRowModel[];
}
