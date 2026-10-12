import { Module } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { BillingService } from './billing.service';
import { DosePricingService } from './dose-pricing.service';
import { BillingPortalResolver } from './billing-portal.resolver';
import { DevPaymentSimulatorController } from './dev-payment-simulator.controller';
import { RefundRequestsService } from './refund-requests.service';
import { RefundRequestsResolver } from './refund-requests.resolver';
import { PushModule } from '../push/push.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [PrismaModule, EmailModule, ReferralsModule, PushModule],
  controllers: [StripeWebhookController, DevPaymentSimulatorController],
  providers: [StripeWebhookService, BillingService, BillingPortalResolver, DosePricingService, RefundRequestsService, RefundRequestsResolver],
  exports: [BillingService, DosePricingService],
})
export class StripeModule {}
