import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  OnboardingStatus,
  PersonaStatus,
  PhotoReviewStatus,
  PrescriptionProofType,
} from '../../common/enums';
import { PatientModel } from '../../patients/models/patient.model';
import { OnboardingStepFeedbackModel } from './onboarding-step-feedback.model';
import { PrescriptionProofReviewModel } from './prescription-proof-review.model';
import { BodyPhotoCheckSummaryModel } from '../dto/body-photo.input';

@ObjectType('OnboardingSubmission')
export class OnboardingSubmissionModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  patientId: string;

  @Field(() => OnboardingStatus)
  status: OnboardingStatus;

  @Field(() => PersonaStatus)
  personaStatus: PersonaStatus;

  /** True when this patient's ID check ran in verify-service, so there are no ID photos to review here. */
  @Field()
  identityViaVerifyService: boolean;

  @Field(() => PhotoReviewStatus)
  photoReviewStatus: PhotoReviewStatus;

  @Field({ nullable: true })
  priorMedicationUse?: boolean;

  @Field(() => PrescriptionProofType, { nullable: true })
  prescriptionProofType?: PrescriptionProofType;

  @Field({ description: 'Used the medicine before but has no proof — starts on the lowest dose' })
  prescriptionProofUnavailable: boolean;

  @Field({ nullable: true })
  idDocumentUrl?: string;

  @Field({ nullable: true })
  selfieUrl?: string;

  @Field({ nullable: true })
  bodyPhotoFrontUrl?: string;

  @Field({ nullable: true })
  bodyPhotoSideUrl?: string;

  @Field({ nullable: true })
  prescriptionProofUrl?: string;

  @Field(() => PrescriptionProofReviewModel, { nullable: true })
  prescriptionProofReview?: PrescriptionProofReviewModel;

  @Field({ nullable: true })
  submittedAt?: Date;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field(() => [BodyPhotoCheckSummaryModel], { description: 'The automated check of each saved body photo (clinicians only see what it found; they still review every photo)' })
  bodyPhotoChecks: BodyPhotoCheckSummaryModel[];

  @Field(() => [OnboardingStepFeedbackModel])
  stepFeedback: OnboardingStepFeedbackModel[];

  @Field(() => PatientModel, { nullable: true })
  patient?: PatientModel;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
