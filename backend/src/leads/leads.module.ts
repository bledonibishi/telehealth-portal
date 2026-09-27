import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsResolver } from './leads.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [LeadsService, LeadsResolver],
  exports: [LeadsService],
})
export class LeadsModule {}
