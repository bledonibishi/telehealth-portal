import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardLayoutService } from './dashboard-layout.service';
import { DashboardLayoutResolver } from './dashboard-layout.resolver';

@Module({
  imports: [PrismaModule],
  providers: [DashboardLayoutService, DashboardLayoutResolver],
  exports: [DashboardLayoutService],
})
export class DashboardLayoutModule {}
