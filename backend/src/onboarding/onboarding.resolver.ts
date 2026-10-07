import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { AuditRead } from '../audit/audit-read.interceptor';
import { OnboardingService } from './onboarding.service';
import { IdentityVerificationService } from '../identity-verification/identity-verification.service';
import { OnboardingSubmissionModel } from './models/onboarding-submission.model';
import { ProofRequirementsModel } from './models/proof-requirements.model';
import { PrescriptionProofReviewService } from './prescription-proof-review.service';
import { SaveIdentityStepInput } from './dto/save-identity-step.input';
import { SaveBodyPhotosStepInput } from './dto/save-body-photos-step.input';
import { SavePrescriptionProofStepInput } from './dto/save-prescription-proof-step.input';
import { ReviewOnboardingStepInput } from './dto/review-onboarding-step.input';
import { BodyPhotoCheckResultModel, BodyPhotoCheckSummaryModel, BodyPhotoView, PhotoFrameResultModel, SaveBodyPhotoInput } from './dto/body-photo.input';
import { PhotoCheckService } from './photo-check.service';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, STAFF } from '../auth/access-roles';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => OnboardingSubmissionModel)
export class OnboardingResolver {
  constructor(
    private onboardingService: OnboardingService,
    private proofReview: PrescriptionProofReviewService,
    private photoCheck: PhotoCheckService,
    private identity: IdentityVerificationService,
  ) {}

  @ResolveField(() => Boolean)
  identityViaVerifyService(@Parent() submission: { patientId: string }) {
    return this.identity.hasVerification(submission.patientId);
  }

  @ResolveField(() => ProofRequirementsModel, { description: 'What this patient’s prescription proof has to show to be accepted' })
  proofRequirements(@Parent() onboarding: { patientId: string }) {
    return this.proofReview.requirements(onboarding.patientId);
  }

  @ResolveField(() => [BodyPhotoCheckSummaryModel])
  bodyPhotoChecks(@Parent() row: any) {
    return this.onboardingService.checksOf(row);
  }

  @ResolveField(() => [BodyPhotoView], { description: 'Saved body photos that have not passed the photo check, and so would be turned away at submission' })
  bodyPhotosToRetake(@Parent() row: any) {
    return this.onboardingService.bodyPhotosToRetake(row);
  }

  // The patient id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Mutation(() => BodyPhotoCheckResultModel, { description: 'Checks an uploaded body photo (front or side) and says whether it can be used, and if not, why. Never blocks a patient for good.' })
  checkBodyPhoto(@CurrentUser() user: AuthUser, @Args('fileId', { type: () => ID }) fileId: string, @Args('view', { type: () => BodyPhotoView }) view: BodyPhotoView) {
    return this.photoCheck.check(user.id, fileId, view);
  }

  @Authorized('PATIENT')
  @Mutation(() => PhotoFrameResultModel, { description: 'Live guidance on a small camera frame (base64 JPEG) while the patient lines up the shot. Nothing is stored.' })
  checkPhotoFrame(@CurrentUser() user: AuthUser, @Args('view', { type: () => BodyPhotoView }) view: BodyPhotoView, @Args('image') image: string) {
    return this.photoCheck.checkFrame(user.id, view, image);
  }

  @Authorized('PATIENT')
  @Mutation(() => OnboardingSubmissionModel, { description: 'Saves one body photo as soon as it passed its check, so leaving halfway keeps it' })
  saveBodyPhoto(@CurrentUser() user: AuthUser, @Args('input') input: SaveBodyPhotoInput) {
    return this.onboardingService.saveBodyPhoto(user.id, input);
  }

  @Authorized('PATIENT')
  @Mutation(() => Boolean, { description: 'Deletes a body photo that was checked and not kept (a retake)' })
  discardBodyPhoto(@CurrentUser() user: AuthUser, @Args('fileId', { type: () => ID }) fileId: string) {
    return this.onboardingService.discardBodyPhoto(user.id, fileId);
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
