import { Global, Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';
import { NotifierService } from './notifier.service';

/** Global, so any service can tell someone something happened without each module importing this one. */
@Global()
@Module({
  imports: [PushModule, EmailModule],
  providers: [NotifierService],
  exports: [NotifierService],
})
export class NotifierModule {}
