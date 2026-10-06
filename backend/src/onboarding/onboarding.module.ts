import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingResolver } from './onboarding.resolver';
import { PersonaService } from './persona.service';
import { PhotoReviewService } from './photo-review.service';
import { PhotoCheckService } from './photo-check.service';
import { PoseDetector } from './pose-detector';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [OnboardingService, OnboardingResolver, PersonaService, PhotoReviewService, PhotoCheckService, PoseDetector],
})
export class OnboardingModule {}
