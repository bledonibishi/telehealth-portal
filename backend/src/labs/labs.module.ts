import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LabsService } from './labs.service';
import { LabsResolver } from './labs.resolver';

@Module({
  imports: [PrismaModule],
  providers: [LabsService, LabsResolver],
  exports: [LabsService],
})
export class LabsModule {}
