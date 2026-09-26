import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { CheckInsService } from './check-ins.service';
import { CheckInsResolver } from './check-ins.resolver';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [CheckInsService, CheckInsResolver],
})
export class CheckInsModule {}
