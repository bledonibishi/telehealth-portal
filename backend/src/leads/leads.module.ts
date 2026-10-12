import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsResolver } from './leads.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { LeadRemindersService } from './lead-reminders.service';
import { LeadRemindersController } from './lead-reminders.controller';

@Module({
  imports: [PrismaModule, ReferralsModule, AuthModule, EmailModule],
  controllers: [LeadRemindersController],
  providers: [LeadsService, LeadsResolver, LeadRemindersService],
  exports: [LeadsService],
})
export class LeadsModule {}
