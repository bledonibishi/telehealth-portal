import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingResolver } from './onboarding.resolver';
import { PersonaService } from './persona.service';
import { PhotoReviewService } from './photo-review.service';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';

@Module({
  imports: [PrismaModule, IdentityVerificationModule],
  providers: [OnboardingService, OnboardingResolver, PersonaService, PhotoReviewService],
})
export class OnboardingModule {}
