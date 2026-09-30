import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DosingService } from './dosing.service';
import { DosingResolver } from './dosing.resolver';

@Module({
  imports: [PrismaModule],
  providers: [DosingService, DosingResolver],
  exports: [DosingService],
})
export class DosingModule {}
