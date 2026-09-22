import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ConsultationsService } from './consultations.service';
import { ConsultationsResolver } from './consultations.resolver';

@Module({
  imports: [AuditModule, AuthModule],
  providers: [ConsultationsService, ConsultationsResolver],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
