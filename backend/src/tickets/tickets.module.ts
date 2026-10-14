import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsService } from './tickets.service';
import { TicketsResolver } from './tickets.resolver';
import { EngineeringNotifierService } from './engineering-notifier.service';

@Module({
  imports: [PrismaModule],
  providers: [TicketsService, TicketsResolver, EngineeringNotifierService],
  exports: [TicketsService],
})
export class TicketsModule {}
