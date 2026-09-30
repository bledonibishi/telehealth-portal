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
  OnboardingStepKey,
  CheckInStatus,
  CheckInFeeling,
  RefundStatus,
  ProductCategory,
  ProductForm,
  PrescriptionStatus,
  OrderStatus,
  CheckInOutcome,
  ConsentType,
  DoseStatus,
  SymptomScale,
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
registerEnumType(OnboardingStepKey, { name: 'OnboardingStepKey' });
registerEnumType(CheckInStatus, { name: 'CheckInStatus' });
registerEnumType(CheckInFeeling, { name: 'CheckInFeeling' });
registerEnumType(RefundStatus, { name: 'RefundStatus' });
registerEnumType(ProductCategory, { name: 'ProductCategory' });
registerEnumType(ProductForm, { name: 'ProductForm' });
registerEnumType(PrescriptionStatus, { name: 'PrescriptionStatus' });
registerEnumType(OrderStatus, { name: 'OrderStatus' });
registerEnumType(CheckInOutcome, { name: 'CheckInOutcome' });
registerEnumType(ConsentType, { name: 'ConsentType' });
registerEnumType(DoseStatus, { name: 'DoseStatus' });
registerEnumType(SymptomScale, { name: 'SymptomScale' });

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
  OnboardingStepKey,
  CheckInStatus,
  CheckInFeeling,
  RefundStatus,
  ProductCategory,
  ProductForm,
  PrescriptionStatus,
  OrderStatus,
  CheckInOutcome,
  ConsentType,
  DoseStatus,
  SymptomScale,
};
