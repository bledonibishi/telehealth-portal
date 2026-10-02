import { Module } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { BillingService } from './billing.service';
import { BillingPortalResolver } from './billing-portal.resolver';
import { DevPaymentSimulatorController } from './dev-payment-simulator.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [PrismaModule, EmailModule, ReferralsModule],
  controllers: [StripeWebhookController, DevPaymentSimulatorController],
  providers: [StripeWebhookService, BillingService, BillingPortalResolver],
  exports: [BillingService],
})
export class StripeModule {}
