import { Resolver, Mutation, ObjectType, Field } from '@nestjs/graphql';
import { ConfigService } from '@nestjs/config';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/access-roles';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums';
import { BillingService } from './billing.service';

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
