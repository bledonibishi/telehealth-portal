import { registerEnumType } from '@nestjs/graphql';
import { TicketPriority, TicketStatus, TicketType } from '@prisma/client';
import {
  ConsultationStatus,
  ConsultationKind,
  UserRole,
  RedFlagSeverity,
  RiskTag,
  ClinicianRole,
  OnboardingStatus,
  PersonaStatus,
  IdentityVerificationStatus,
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
  LabResultKind,
  ReferralStatus,
  VoucherKind,
  VoucherStatus,
} from '@telehealth/shared-types';

registerEnumType(ConsultationStatus, { name: 'ConsultationStatus' });
registerEnumType(ConsultationKind, { name: 'ConsultationKind' });
registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(RedFlagSeverity, { name: 'RedFlagSeverity' });
// Lab reports are backend-only, so their enums live here rather than in the shared package.
export enum LabReportSource {
  PATIENT = 'PATIENT',
  STAFF = 'STAFF',
}
export enum LabReportStatus {
  PENDING = 'PENDING',
  ENTERED = 'ENTERED',
  REJECTED = 'REJECTED',
}
registerEnumType(LabReportSource, { name: 'LabReportSource' });
registerEnumType(LabReportStatus, { name: 'LabReportStatus' });

registerEnumType(RiskTag, { name: 'RiskTag' });
registerEnumType(ClinicianRole, { name: 'ClinicianRole' });
registerEnumType(OnboardingStatus, { name: 'OnboardingStatus' });
registerEnumType(PersonaStatus, { name: 'PersonaStatus' });
registerEnumType(IdentityVerificationStatus, { name: 'IdentityVerificationStatus' });
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
registerEnumType(LabResultKind, { name: 'LabResultKind' });
registerEnumType(ReferralStatus, { name: 'ReferralStatus' });
registerEnumType(VoucherKind, { name: 'VoucherKind' });
registerEnumType(VoucherStatus, { name: 'VoucherStatus' });
registerEnumType(TicketType, { name: 'TicketType' });
registerEnumType(TicketStatus, { name: 'TicketStatus' });
registerEnumType(TicketPriority, { name: 'TicketPriority' });

export {
  ConsultationStatus,
  ConsultationKind,
  UserRole,
  RedFlagSeverity,
  RiskTag,
  ClinicianRole,
  OnboardingStatus,
  PersonaStatus,
  IdentityVerificationStatus,
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
  LabResultKind,
  ReferralStatus,
  VoucherKind,
  VoucherStatus,
  TicketType,
  TicketStatus,
  TicketPriority,
};
