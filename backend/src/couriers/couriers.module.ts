import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { CouriersController } from './couriers.controller';
import { COURIER_TRACKERS } from './courier-adapter';
import { CouriersService } from './couriers.service';

@Module({
  imports: [PrismaModule, PrescriptionsModule],
  controllers: [CouriersController],
  // Couriers with a tracking API (that we ask, rather than that call us) are listed here as they are added.
  providers: [CouriersService, { provide: COURIER_TRACKERS, useValue: [] }],
})
export class CouriersModule {}
