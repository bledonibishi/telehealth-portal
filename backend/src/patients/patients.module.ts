import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsResolver } from './patients.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ConsentsModule } from '../consents/consents.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';

@Module({
  imports: [PrismaModule, ConsentsModule, PrescriptionsModule],
  providers: [PatientsService, PatientsResolver],
  exports: [PatientsService],
})
export class PatientsModule {}
