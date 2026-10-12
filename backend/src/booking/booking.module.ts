import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingService } from './booking.service';
import { BookingResolver } from './booking.resolver';
import { CalcomClient } from './calcom/calcom.client';
import { CalcomWebhookController } from './calcom/calcom-webhook.controller';

/**
 * Scheduling as a service to the rest of the app. Import this module, register a purpose with
 * BookingService, and send patients to a `bookingSession` — see booking/README.md.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CalcomWebhookController],
  providers: [BookingService, BookingResolver, CalcomClient],
  exports: [BookingService],
})
export class BookingModule {}
