import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';
import { StripeModule } from '../stripe/stripe.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { CheckInsService } from './check-ins.service';
import { CheckInsResolver } from './check-ins.resolver';
import { CheckInReviewService } from './check-in-review.service';
import { CheckInReportService } from './check-in-report.service';
import { CheckInReportController } from './check-in-report.controller';

@Module({
  imports: [PrismaModule, EmailModule, AuditModule, StripeModule, MessagingModule, PrescriptionsModule],
  controllers: [CheckInReportController],
  providers: [CheckInsService, CheckInsResolver, CheckInReviewService, CheckInReportService],
  exports: [CheckInsService],
})
export class CheckInsModule {}
