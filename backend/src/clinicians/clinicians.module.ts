import { Module } from '@nestjs/common';
import { CliniciansService } from './clinicians.service';

@Module({
  providers: [CliniciansService],
  exports: [CliniciansService],
})
export class CliniciansModule {}
