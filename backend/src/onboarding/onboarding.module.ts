import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingResolver } from './onboarding.resolver';
import { PersonaService } from './persona.service';
import { PhotoReviewService } from './photo-review.service';
import { ProofReaderService } from './proof-reader.service';
import { PrescriptionProofReviewService } from './prescription-proof-review.service';
import { PhotoCheckService } from './photo-check.service';
import { PoseDetector } from './pose-detector';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';

@Module({
  imports: [PrismaModule, UploadsModule, IdentityVerificationModule],
  providers: [
    OnboardingService,
    OnboardingResolver,
    PersonaService,
    PhotoReviewService,
    PhotoCheckService,
    PoseDetector,
    ProofReaderService,
    PrescriptionProofReviewService,
  ],
  exports: [PrescriptionProofReviewService],
})
export class OnboardingModule {}
