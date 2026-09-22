import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';

@Module({
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
