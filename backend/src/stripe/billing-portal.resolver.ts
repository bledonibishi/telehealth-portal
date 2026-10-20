import { Resolver, Mutation, Query, ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { ConfigService } from '@nestjs/config';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/access-roles';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums';
import { BillingService } from './billing.service';

@ObjectType('Invoice')
export class InvoiceModel {
  @Field(() => ID)
  id: string;

  @Field()
  createdAt: Date;

  @Field(() => Int, { description: 'In the smallest currency unit (cents)' })
  amountCents: number;

  @Field({ description: 'ISO code, e.g. EUR' })
  currency: string;

  @Field({ description: 'PAID, or UNPAID while a payment is still owed' })
  status: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  cardBrand?: string | null;

  @Field(() => String, { nullable: true })
  cardLast4?: string | null;

  @Field(() => String, { nullable: true, description: 'Stripe’s page for the invoice' })
  viewUrl?: string | null;

  @Field(() => String, { nullable: true, description: 'A PDF of the invoice' })
  pdfUrl?: string | null;
}

@ObjectType('SubscriptionState')
export class SubscriptionStateModel {
  @Field({ description: 'Stripe’s status: active, incomplete, past_due, canceled …' })
  status: string;

  @Field({ description: 'The subscription has been stopped and ends after the period already paid for (or has ended)' })
  endsAtPeriodEnd: boolean;

  @Field(() => Date, { nullable: true, description: 'When the last paid period ends, once it has been stopped' })
  endsAt?: Date | null;
}

@ObjectType('BillingPortalSession')
export class BillingPortalSessionModel {
  @Field({ description: 'Where to send the patient; single use, and it expires shortly' })
  url: string;
}

@Resolver()
export class BillingPortalResolver {
  constructor(
    private billing: BillingService,
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  @Authorized('PATIENT')
  @Query(() => [InvoiceModel], { description: 'The signed-in patient’s recent payments, newest first, each with a PDF link' })
  async myInvoices(@CurrentUser() user: AuthUser): Promise<InvoiceModel[]> {
    const patient = await this.prisma.patient.findUniqueOrThrow({
      where: { id: user.id },
      select: { email: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });
    return this.billing.listInvoices(patient);
  }

  @Authorized('PATIENT')
  @Query(() => SubscriptionStateModel, { nullable: true, description: 'Whether the signed-in patient’s subscription is running or has been stopped; null when they have none' })
  async mySubscription(@CurrentUser() user: AuthUser): Promise<SubscriptionStateModel | null> {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, stripeCustomerId: true, stripeSubscriptionId: true } });
    return this.billing.subscriptionState(patient);
  }

  @Authorized('PATIENT')
  @Mutation(() => BillingPortalSessionModel, { description: 'Opens Stripe’s customer portal: update the card, see invoices, manage or cancel the subscription' })
  async createBillingPortalSession(@CurrentUser() user: AuthUser): Promise<BillingPortalSessionModel> {
    const patient = await this.prisma.patient.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, email: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });
    const portalApp = this.config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
    const url = await this.billing.createPortalSession(patient, `${portalApp}/dashboard`);

    await this.audit.log({
      actorId: patient.id,
      actorRole: UserRole.PATIENT,
      action: 'BILLING_PORTAL_OPENED',
      resourceType: 'Patient',
      resourceId: patient.id,
    });
    return { url };
  }
}
