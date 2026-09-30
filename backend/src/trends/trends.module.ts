import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrendsService } from './trends.service';
import { TrendsResolver } from './trends.resolver';

@Module({
  imports: [PrismaModule],
  providers: [TrendsService, TrendsResolver],
})
export class TrendsModule {}
