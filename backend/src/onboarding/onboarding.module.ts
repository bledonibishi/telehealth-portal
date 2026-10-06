import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingResolver } from './onboarding.resolver';
import { PersonaService } from './persona.service';
import { PhotoReviewService } from './photo-review.service';
import { ProofReaderService } from './proof-reader.service';
import { PrescriptionProofReviewService } from './prescription-proof-review.service';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [
    OnboardingService,
    OnboardingResolver,
    PersonaService,
    PhotoReviewService,
    ProofReaderService,
    PrescriptionProofReviewService,
  ],
  exports: [PrescriptionProofReviewService],
})
export class OnboardingModule {}
