import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingResolver } from './onboarding.resolver';
import { PersonaService } from './persona.service';
import { PhotoReviewService } from './photo-review.service';

@Module({
  imports: [PrismaModule],
  providers: [OnboardingService, OnboardingResolver, PersonaService, PhotoReviewService],
})
export class OnboardingModule {}
