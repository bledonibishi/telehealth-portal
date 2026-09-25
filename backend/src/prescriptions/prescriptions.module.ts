import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsResolver } from './prescriptions.resolver';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PrescriptionsService, PrescriptionsResolver],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
