import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SideEffectsModule } from '../side-effects/side-effects.module';
import { AiAssistService } from './ai-assist.service';
import { CheckInBriefService } from './check-in-brief.service';
import { MessageAssistService } from './message-assist.service';
import { MessageUrgencyService } from './message-urgency.service';
import { PatientSearchService } from './patient-search.service';
import { AiResolver } from './ai.resolver';

@Module({
  imports: [PrismaModule, SideEffectsModule],
  providers: [AiAssistService, CheckInBriefService, MessageAssistService, MessageUrgencyService, PatientSearchService, AiResolver],
  exports: [MessageUrgencyService, AiAssistService],
})
export class AiModule {}
