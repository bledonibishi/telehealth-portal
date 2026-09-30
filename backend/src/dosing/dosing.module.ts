import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { DosingService } from './dosing.service';
import { DosingResolver } from './dosing.resolver';
import { DosingCronController } from './dosing-cron.controller';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [DosingCronController],
  providers: [DosingService, DosingResolver],
  exports: [DosingService],
})
export class DosingModule {}
