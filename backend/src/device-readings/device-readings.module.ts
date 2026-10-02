import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WeightJourneyModule } from '../weight-journey/weight-journey.module';
import { DeviceConnectionsResolver } from './device-connections.resolver';
import { DeviceConnectionsService } from './device-connections.service';
import { DeviceReadingsController } from './device-readings.controller';
import { DeviceReadingsService } from './device-readings.service';

@Module({
  imports: [PrismaModule, WeightJourneyModule],
  controllers: [DeviceReadingsController],
  providers: [DeviceConnectionsService, DeviceConnectionsResolver, DeviceReadingsService],
})
export class DeviceReadingsModule {}
