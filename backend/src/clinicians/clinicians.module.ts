import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CliniciansService } from './clinicians.service';
import { CliniciansResolver } from './clinicians.resolver';

@Module({
  imports: [AuditModule],
  providers: [CliniciansService, CliniciansResolver],
  exports: [CliniciansService],
})
export class CliniciansModule {}
