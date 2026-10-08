import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { CliniciansService } from './clinicians.service';
import { CliniciansResolver } from './clinicians.resolver';

@Module({
  imports: [AuditModule, EmailModule],
  providers: [CliniciansService, CliniciansResolver],
  exports: [CliniciansService],
})
export class CliniciansModule {}
