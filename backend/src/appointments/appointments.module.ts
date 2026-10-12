import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { BookingModule } from '../booking/booking.module';
import { AppointmentsService } from './appointments.service';
import { AppointmentsResolver } from './appointments.resolver';

@Module({
  imports: [PrismaModule, AuditModule, EmailModule, BookingModule],
  providers: [AppointmentsService, AppointmentsResolver],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
