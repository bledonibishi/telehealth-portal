import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushService } from './push.service';
import { PushResolver } from './push.resolver';

@Module({
  imports: [PrismaModule],
  providers: [PushService, PushResolver],
  exports: [PushService],
})
export class PushModule {}
