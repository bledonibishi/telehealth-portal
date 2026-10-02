import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditReadInterceptor } from './audit-read.interceptor';
import { AuditResolver } from './audit.resolver';

// Global: almost every module writes audit entries, and @AuditRead needs the
// service wherever it's applied.
@Global()
@Module({
  providers: [AuditService, AuditReadInterceptor, AuditResolver],
  exports: [AuditService, AuditReadInterceptor],
})
export class AuditModule {}
