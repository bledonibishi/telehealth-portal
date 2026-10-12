import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { StripeModule } from '../stripe/stripe.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EmailModule } from '../email/email.module';
import { ConsentsModule } from '../consents/consents.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { ConsultationsService } from './consultations.service';
import { ConsultationsResolver } from './consultations.resolver';

@Module({
  imports: [AuditModule, AuthModule, StripeModule, PrescriptionsModule, MessagingModule, EmailModule, ConsentsModule, OnboardingModule],
  providers: [ConsultationsService, ConsultationsResolver],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
