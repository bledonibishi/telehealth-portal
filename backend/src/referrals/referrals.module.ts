import { Module } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsResolver } from './referrals.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [ReferralsService, ReferralsResolver],
  exports: [ReferralsService],
})
export class ReferralsModule {}
