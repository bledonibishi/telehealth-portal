import { Module } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { BillingService } from './billing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [StripeWebhookController],
  providers: [StripeWebhookService, BillingService],
  exports: [BillingService],
})
export class StripeModule {}
