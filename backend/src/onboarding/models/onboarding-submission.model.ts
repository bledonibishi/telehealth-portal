import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  OnboardingStatus,
  PersonaStatus,
  PhotoReviewStatus,
  PrescriptionProofType,
} from '../../common/enums';
import { PatientModel } from '../../patients/models/patient.model';

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

  @Field(() => PhotoReviewStatus)
  photoReviewStatus: PhotoReviewStatus;

  @Field({ nullable: true })
  priorMedicationUse?: boolean;

  @Field(() => PrescriptionProofType, { nullable: true })
  prescriptionProofType?: PrescriptionProofType;

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

  @Field({ nullable: true })
  submittedAt?: Date;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field({ nullable: true })
  rejectionReason?: string;

  @Field(() => PatientModel, { nullable: true })
  patient?: PatientModel;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
