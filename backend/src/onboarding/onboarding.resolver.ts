import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards, ForbiddenException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingSubmissionModel } from './models/onboarding-submission.model';
import { SaveIdentityStepInput } from './dto/save-identity-step.input';
import { SaveBodyPhotosStepInput } from './dto/save-body-photos-step.input';
import { SavePrescriptionProofStepInput } from './dto/save-prescription-proof-step.input';
import { ReviewOnboardingInput } from './dto/review-onboarding.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type AuthUser = { id: string; role: string };

function requirePatient(user: AuthUser) {
  if (user.role !== 'PATIENT') throw new ForbiddenException('Patients only');
}

function requireClinician(user: AuthUser) {
  if (user.role !== 'CLINICIAN') throw new ForbiddenException('Clinicians only');
}

@Resolver(() => OnboardingSubmissionModel)
export class OnboardingResolver {
  constructor(private onboardingService: OnboardingService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => OnboardingSubmissionModel)
  myOnboarding(@CurrentUser() user: AuthUser) {
    requirePatient(user);
    return this.onboardingService.getOrCreateForPatient(user.id);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [OnboardingSubmissionModel])
  onboardingQueue(@CurrentUser() user: AuthUser) {
    requireClinician(user);
    return this.onboardingService.findQueue();
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => OnboardingSubmissionModel, { nullable: true })
  onboardingSubmission(@CurrentUser() user: AuthUser, @Args('patientId', { type: () => ID }) patientId: string) {
    requireClinician(user);
    return this.onboardingService.findByPatientId(patientId);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => OnboardingSubmissionModel)
  saveIdentityStep(@CurrentUser() user: AuthUser, @Args('input') input: SaveIdentityStepInput) {
    requirePatient(user);
    return this.onboardingService.saveIdentityStep(user.id, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => OnboardingSubmissionModel)
  saveBodyPhotosStep(@CurrentUser() user: AuthUser, @Args('input') input: SaveBodyPhotosStepInput) {
    requirePatient(user);
    return this.onboardingService.saveBodyPhotosStep(user.id, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => OnboardingSubmissionModel)
  savePriorMedicationUse(@CurrentUser() user: AuthUser, @Args('priorMedicationUse') priorMedicationUse: boolean) {
    requirePatient(user);
    return this.onboardingService.savePriorMedicationUse(user.id, priorMedicationUse);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => OnboardingSubmissionModel)
  savePrescriptionProofStep(@CurrentUser() user: AuthUser, @Args('input') input: SavePrescriptionProofStepInput) {
    requirePatient(user);
    return this.onboardingService.savePrescriptionProofStep(user.id, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => OnboardingSubmissionModel)
  submitOnboarding(@CurrentUser() user: AuthUser) {
    requirePatient(user);
    return this.onboardingService.submit(user.id);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => OnboardingSubmissionModel)
  reviewOnboarding(@CurrentUser() user: AuthUser, @Args('input') input: ReviewOnboardingInput) {
    requireClinician(user);
    return this.onboardingService.review(user.id, input);
  }
}
