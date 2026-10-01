import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SymptomsService } from './symptoms.service';
import { SymptomsResolver } from './symptoms.resolver';

@Module({
  imports: [PrismaModule],
  providers: [SymptomsService, SymptomsResolver],
})
export class SymptomsModule {}
