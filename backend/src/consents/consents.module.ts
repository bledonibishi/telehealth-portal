import { Module } from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { ConsentsResolver } from './consents.resolver';

@Module({
  providers: [ConsentsService, ConsentsResolver],
  exports: [ConsentsService],
})
export class ConsentsModule {}
