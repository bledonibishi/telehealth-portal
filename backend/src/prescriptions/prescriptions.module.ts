import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsResolver } from './prescriptions.resolver';
import { PrescribingService } from './prescribing.service';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EmailModule } from '../email/email.module';
import { DosingModule } from '../dosing/dosing.module';
import { PrescriptionFieldsResolver } from './prescription-fields.resolver';
import { PrescriptionDocumentService } from './prescription-document.service';
import { PrescriptionDocumentController } from './prescription-document.controller';

@Module({
  imports: [PrismaModule, AuditModule, MessagingModule, EmailModule, DosingModule],
  controllers: [PrescriptionDocumentController],
  providers: [PrescriptionsService, PrescriptionsResolver, PrescriptionFieldsResolver, PrescribingService, PrescriptionDocumentService, OrdersService],
  exports: [PrescriptionsService, PrescribingService, OrdersService],
})
export class PrescriptionsModule {}
