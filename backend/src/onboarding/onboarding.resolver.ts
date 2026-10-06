import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { AuditRead } from '../audit/audit-read.interceptor';
import { OnboardingService } from './onboarding.service';
import { OnboardingSubmissionModel } from './models/onboarding-submission.model';
import { ProofRequirementsModel } from './models/proof-requirements.model';
import { PrescriptionProofReviewService } from './prescription-proof-review.service';
import { SaveIdentityStepInput } from './dto/save-identity-step.input';
import { SaveBodyPhotosStepInput } from './dto/save-body-photos-step.input';
import { SavePrescriptionProofStepInput } from './dto/save-prescription-proof-step.input';
import { ReviewOnboardingStepInput } from './dto/review-onboarding-step.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, STAFF } from '../auth/access-roles';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => OnboardingSubmissionModel)
export class OnboardingResolver {
  constructor(
    private onboardingService: OnboardingService,
    private proofReview: PrescriptionProofReviewService,
  ) {}

  @ResolveField(() => ProofRequirementsModel, { description: 'What this patient’s prescription proof has to show to be accepted' })
  proofRequirements(@Parent() onboarding: { patientId: string }) {
    return this.proofReview.requirements(onboarding.patientId);
  }

  @Authorized('PATIENT')
  @Query(() => OnboardingSubmissionModel)
  myOnboarding(@CurrentUser() user: AuthUser) {
    return this.onboardingService.getOrCreateForPatient(user.id);
  }

  @Authorized(...STAFF)
  @Query(() => [OnboardingSubmissionModel])
  onboardingQueue(@CurrentUser() user: AuthUser) {
    return this.onboardingService.findQueue();
  }

  @Authorized(...STAFF)
  @AuditRead('OnboardingSubmission', 'patientId')
  @Query(() => OnboardingSubmissionModel, { nullable: true })
  onboardingSubmission(@CurrentUser() user: AuthUser, @Args('patientId', { type: () => ID }) patientId: string) {
    return this.onboardingService.findByPatientId(patientId);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel)
  saveIdentityStep(@CurrentUser() user: AuthUser, @Args('input') input: SaveIdentityStepInput) {
    return this.onboardingService.saveIdentityStep(user.id, input);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel)
  saveBodyPhotosStep(@CurrentUser() user: AuthUser, @Args('input') input: SaveBodyPhotosStepInput) {
    return this.onboardingService.saveBodyPhotosStep(user.id, input);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel)
  savePriorMedicationUse(@CurrentUser() user: AuthUser, @Args('priorMedicationUse') priorMedicationUse: boolean) {
    return this.onboardingService.savePriorMedicationUse(user.id, priorMedicationUse);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel)
  savePrescriptionProofStep(@CurrentUser() user: AuthUser, @Args('input') input: SavePrescriptionProofStepInput) {
    return this.onboardingService.savePrescriptionProofStep(user.id, input);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel, {
    description: 'The patient used the medicine before but has no proof; they start on the lowest dose',
  })
  declarePrescriptionProofUnavailable(@CurrentUser() user: AuthUser) {
    return this.onboardingService.declarePrescriptionProofUnavailable(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel, {
    description: 'When the proof’s dose differs from the questionnaire: DOCUMENT_CORRECT, STEPPED_UP_SINCE, STEPPED_DOWN_SINCE or NOT_SURE',
  })
  clarifyPrescriptionDose(@CurrentUser() user: AuthUser, @Args('choice') choice: string) {
    return this.onboardingService.clarifyPrescriptionDose(user.id, choice);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel, {
    description: 'A name-change document (marriage certificate, deed poll…) for when the name on the prescription proof differs',
  })
  savePrescriptionNameEvidence(@CurrentUser() user: AuthUser, @Args('fileId', { type: () => ID }) fileId: string) {
    return this.onboardingService.savePrescriptionNameEvidence(user.id, fileId);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel)
  submitOnboarding(@CurrentUser() user: AuthUser) {
    return this.onboardingService.submit(user.id);
  }

  @Authorized(...STAFF)
  @Mutation(() => OnboardingSubmissionModel)
  reviewOnboardingStep(@CurrentUser() user: AuthUser, @Args('input') input: ReviewOnboardingStepInput) {
    return this.onboardingService.reviewOnboardingStep(user.id, input);
  }
}
