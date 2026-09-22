import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';

@Module({
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
