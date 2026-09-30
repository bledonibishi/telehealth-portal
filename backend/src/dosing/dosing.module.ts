import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { DosingService } from './dosing.service';
import { DosingResolver } from './dosing.resolver';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [DosingService, DosingResolver],
  exports: [DosingService],
})
export class DosingModule {}
