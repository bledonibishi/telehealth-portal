import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WeightJourneyModule } from '../weight-journey/weight-journey.module';
import { HealthAlertsResolver } from './health-alerts.resolver';
import { HealthAlertsService } from './health-alerts.service';

@Module({
  imports: [PrismaModule, WeightJourneyModule],
  providers: [HealthAlertsService, HealthAlertsResolver],
})
export class HealthAlertsModule {}
