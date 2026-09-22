import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { MessagingService } from './messaging.service';
import { MessagingResolver } from './messaging.resolver';

@Module({
  imports: [AuditModule, AuthModule],
  providers: [MessagingService, MessagingResolver],
  exports: [MessagingService],
})
export class MessagingModule {}
