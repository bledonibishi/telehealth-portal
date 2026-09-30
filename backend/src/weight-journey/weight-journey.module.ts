import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CheckInsModule } from '../check-ins/check-ins.module';
import { WeightJourneyService } from './weight-journey.service';
import { WeightJourneyResolver } from './weight-journey.resolver';
import { WeightMeasurementsService } from './weight-measurements.service';
import { WeightMeasurementsResolver } from './weight-measurements.resolver';

@Module({
  imports: [PrismaModule, AuditModule, CheckInsModule],
  providers: [WeightJourneyService, WeightJourneyResolver, WeightMeasurementsService, WeightMeasurementsResolver],
})
export class WeightJourneyModule {}
