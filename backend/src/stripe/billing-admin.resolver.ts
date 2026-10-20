import { Args, Field, ID, Int, ObjectType, Query, Mutation, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicianRole, OrderStatus } from '../common/enums';
import { BillingService } from './billing.service';
import { InvoiceModel, SubscriptionStateModel } from './billing-portal.resolver';
import { RefundRequestModel } from './refund-requests.resolver';
import { partnerReference } from '../prescriptions/partner-payload';

const BILLING_PATIENT = { id: true, email: true, firstName: true, lastName: true, stripeCustomerId: true, stripeSubscriptionId: true, paysPerSupply: true } as const;

@ObjectType('RefundDecision')
export class RefundDecisionModel extends RefundRequestModel {
  @Field() patientName: string;
  @Field() patientEmail: string;
  @Field({ nullable: true, description: 'The admin who decided' }) decidedByName?: string;
}

@ObjectType('BillingOrder')
export class BillingOrderModel {
  @Field(() => ID) id: string;
  @Field(() => Int) sequence: number;
  @Field() status: string;
  @Field() createdAt: Date;
  @Field({ nullable: true }) dispatchedAt?: Date;
  @Field({ nullable: true, description: 'When the patient paid for it (patients who pay per supply)' }) paidAt?: Date;
  @Field(() => Int, { nullable: true }) paymentAmountCents?: number;
  @Field({ nullable: true }) paymentCurrency?: string;
}

@ObjectType('RefundPreview')
export class RefundPreviewModel {
  @Field(() => Int, { description: 'What a refund of the latest payment would return, in cents' }) amountCents: number;
  @Field(() => Int, { description: 'The prescription fee a refund would keep, in cents; 0 when everything goes back' }) feeKeptCents: number;
  @Field() currency: string;
}

@ObjectType('BillingOverview')
export class BillingOverviewModel {
  @Field(() => ID) patientId: string;
  @Field() patientName: string;
  @Field({ description: 'SUBSCRIPTION, ONE_TIME (pays for each supply) or UNKNOWN' }) plan: string;
  @Field(() => SubscriptionStateModel, { nullable: true }) subscription?: SubscriptionStateModel | null;
  @Field(() => [InvoiceModel]) invoices: InvoiceModel[];
  @Field({ description: 'False when Stripe could not be reached, so the list above may be incomplete' }) invoicesAvailable: boolean;
  @Field(() => RefundPreviewModel, { nullable: true, description: 'What refunding the latest payment would return now' }) refundPreview?: RefundPreviewModel | null;
  @Field(() => [BillingOrderModel]) orders: BillingOrderModel[];
  @Field(() => [RefundRequestModel]) refundHistory: RefundRequestModel[];
}

@ObjectType('AwaitingPayment')
export class AwaitingPaymentModel {
  @Field(() => ID) orderId: string;
  @Field() reference: string;
  @Field(() => Int) sequence: number;
  @Field(() => ID) patientId: string;
  @Field() patientName: string;
  @Field() patientEmail: string;
  @Field({ nullable: true }) medication?: string;
  @Field({ nullable: true }) dosage?: string;
  @Field() createdAt: Date;
  @Field({ nullable: true, description: 'Where the patient pays; empty while the invoice is still being made' }) paymentUrl?: string;
  @Field(() => Int, { nullable: true }) paymentAmountCents?: number;
  @Field({ nullable: true }) paymentCurrency?: string;
  @Field({ nullable: true, description: 'When the reminder email went out' }) reminderSentAt?: Date;
}

@ObjectType('PaymentFailure')
export class PaymentFailureModel {
  @Field(() => ID) patientId: string;
  @Field() patientName: string;
  @Field() patientEmail: string;
  @Field() failedAt: Date;
}

/** What an admin needs to look after money: who asked for a refund and what they paid, who has not paid, whose card failed. */
@Resolver()
export class BillingAdminResolver {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
  ) {}

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => BillingOverviewModel, { description: 'One patient’s money at a glance: how they pay, their payments, supplies and past refund requests' })
  async billingOverview(@Args('patientId', { type: () => ID }) patientId: string): Promise<BillingOverviewModel> {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: BILLING_PATIENT });
    if (!patient) throw new BadRequestException('Patient not found');
    const written = await this.prisma.prescription.findFirst({ where: { patientId }, orderBy: { issuedAt: 'desc' }, select: { issuedAt: true } });
    const [subscription, invoices, orders, refunds, refundPreview] = await Promise.all([
      this.billing.subscriptionState(patient),
      this.billing.listInvoices(patient).then((list) => ({ list, ok: true })).catch(() => ({ list: [], ok: false })),
      this.prisma.order.findMany({ where: { patientId }, orderBy: { sequence: 'desc' }, take: 24 }),
      this.prisma.refundRequest.findMany({ where: { patientId }, orderBy: { requestedAt: 'desc' }, take: 10 }),
      this.billing.previewRefund(patient, { prescriptionIssuedAt: written?.issuedAt ?? null }),
    ]);
    return {
      patientId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      plan: patient.paysPerSupply ? 'ONE_TIME' : subscription ? 'SUBSCRIPTION' : 'UNKNOWN',
      subscription,
      invoices: invoices.list as InvoiceModel[],
      invoicesAvailable: invoices.ok,
      refundPreview,
      orders: orders.map((o) => ({
        id: o.id, sequence: o.sequence, status: o.status, createdAt: o.createdAt, dispatchedAt: o.dispatchedAt ?? undefined, paidAt: o.paidAt ?? undefined,
        paymentAmountCents: o.paymentAmountCents ?? undefined, paymentCurrency: o.paymentCurrency ?? undefined,
      })),
      refundHistory: refunds.map((r) => ({ id: r.id, status: r.status, requestedAt: r.requestedAt, decidedAt: r.decidedAt ?? undefined, outcome: r.outcome ?? undefined })),
    };
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [RefundDecisionModel], { description: 'Refund requests that have been decided, newest first' })
  async refundDecisions(@Args('limit', { type: () => Int, defaultValue: 50 }) limit: number): Promise<RefundDecisionModel[]> {
    const rows = await this.prisma.refundRequest.findMany({
      where: { status: { not: 'REQUESTED' } },
      orderBy: { decidedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { patient: { select: { firstName: true, lastName: true, email: true } } },
    });
    const ids = [...new Set(rows.map((r) => r.decidedById).filter((x): x is string => !!x))];
    const admins = ids.length ? await this.prisma.clinician.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const name = new Map(admins.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
    return rows.map((r) => ({
      id: r.id, status: r.status, requestedAt: r.requestedAt, decidedAt: r.decidedAt ?? undefined, outcome: r.outcome ?? undefined,
      patientName: `${r.patient.firstName} ${r.patient.lastName}`, patientEmail: r.patient.email, decidedByName: r.decidedById ? name.get(r.decidedById) : undefined,
    }));
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [AwaitingPaymentModel], { description: 'Supplies a doctor approved that the patient has not paid for yet, oldest first' })
  async awaitingPayment(): Promise<AwaitingPaymentModel[]> {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.AWAITING_PAYMENT },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { patient: { select: { id: true, firstName: true, lastName: true, email: true } }, prescription: { select: { medication: true, dosage: true } } },
    });
    return orders.map((o) => ({
      orderId: o.id, reference: partnerReference(o.id), sequence: o.sequence, patientId: o.patient.id,
      patientName: `${o.patient.firstName} ${o.patient.lastName}`, patientEmail: o.patient.email,
      medication: o.prescription.medication ?? undefined, dosage: o.prescription.dosage ?? undefined, createdAt: o.createdAt,
      paymentUrl: o.paymentUrl ?? undefined, paymentAmountCents: o.paymentAmountCents ?? undefined, paymentCurrency: o.paymentCurrency ?? undefined,
      reminderSentAt: o.paymentReminderAt ?? undefined,
    }));
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [PaymentFailureModel], { description: 'Patients whose last renewal payment failed: no further supply is ordered for them until one succeeds' })
  async paymentFailures(): Promise<PaymentFailureModel[]> {
    const patients = await this.prisma.patient.findMany({
      where: { paymentFailedAt: { not: null } },
      orderBy: { paymentFailedAt: 'asc' },
      take: 200,
      select: { id: true, firstName: true, lastName: true, email: true, paymentFailedAt: true },
    });
    return patients.map((p) => ({ patientId: p.id, patientName: `${p.firstName} ${p.lastName}`, patientEmail: p.email, failedAt: p.paymentFailedAt! }));
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => String, { description: 'Tries again to collect a patient’s unpaid invoice with the card Stripe holds' })
  async retryPatientPayment(@Args('patientId', { type: () => ID }) patientId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: BILLING_PATIENT });
    if (!patient) throw new BadRequestException('Patient not found');
    const result = await this.billing.retryUnpaidInvoice(patient);
    if (!result.ok) throw new BadRequestException(result.note);
    return result.note;
  }
}
