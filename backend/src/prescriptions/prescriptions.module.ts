import { Module } from '@nestjs/common';
import { LabsModule } from '../labs/labs.module';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsResolver } from './prescriptions.resolver';
import { PrescribingService } from './prescribing.service';
import { OrdersService } from './orders.service';
import { PartnerOrdersService } from './partner-orders.service';
import { ShipmentsService } from './shipments.service';
import { RefillService } from './refill.service';
import { RefillResolver } from './refill.resolver';
import { TreatmentPlanService } from './treatment-plan.service';
import { PartnerOrdersResolver } from './partner-orders.resolver';
import { PartnerOrdersCronController } from './partner-orders-cron.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EmailModule } from '../email/email.module';
import { DosingModule } from '../dosing/dosing.module';
import { PrescriptionFieldsResolver } from './prescription-fields.resolver';
import { PrescriptionDocumentService } from './prescription-document.service';
import { PrescriptionDocumentController } from './prescription-document.controller';

@Module({
  imports: [PrismaModule, AuditModule, MessagingModule, EmailModule, DosingModule, LabsModule],
  controllers: [PrescriptionDocumentController, PartnerOrdersCronController],
  providers: [PrescriptionsService, PrescriptionsResolver, PrescriptionFieldsResolver, PrescribingService, PrescriptionDocumentService, OrdersService, PartnerOrdersService, PartnerOrdersResolver, ShipmentsService, RefillService, RefillResolver, TreatmentPlanService],
  exports: [PrescriptionsService, PrescribingService, OrdersService, PartnerOrdersService, ShipmentsService],
})
export class PrescriptionsModule {}
