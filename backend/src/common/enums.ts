import { registerEnumType } from '@nestjs/graphql';
import {
  ConsultationStatus,
  ConsultationKind,
  UserRole,
  RedFlagSeverity,
  ClinicianRole,
  OnboardingStatus,
  PersonaStatus,
  PhotoReviewStatus,
  PrescriptionProofType,
  CheckInStatus,
} from '@telehealth/shared-types';

registerEnumType(ConsultationStatus, { name: 'ConsultationStatus' });
registerEnumType(ConsultationKind, { name: 'ConsultationKind' });
registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(RedFlagSeverity, { name: 'RedFlagSeverity' });
registerEnumType(ClinicianRole, { name: 'ClinicianRole' });
registerEnumType(OnboardingStatus, { name: 'OnboardingStatus' });
registerEnumType(PersonaStatus, { name: 'PersonaStatus' });
registerEnumType(PhotoReviewStatus, { name: 'PhotoReviewStatus' });
registerEnumType(PrescriptionProofType, { name: 'PrescriptionProofType' });
registerEnumType(CheckInStatus, { name: 'CheckInStatus' });

export {
  ConsultationStatus,
  ConsultationKind,
  UserRole,
  RedFlagSeverity,
  ClinicianRole,
  OnboardingStatus,
  PersonaStatus,
  PhotoReviewStatus,
  PrescriptionProofType,
  CheckInStatus,
};
