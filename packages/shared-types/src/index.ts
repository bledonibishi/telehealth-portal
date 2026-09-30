export enum ConsultationStatus {
  SUBMITTED = 'SUBMITTED',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  MORE_INFO_REQUESTED = 'MORE_INFO_REQUESTED',
}

export enum ConsultationKind {
  HRT = 'HRT',
  GLP1 = 'GLP1',
  TRT = 'TRT',
}

export enum UserRole {
  CLINICIAN = 'CLINICIAN',
  PATIENT = 'PATIENT',
  ADMIN = 'ADMIN',
}

export enum ClinicianRole {
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  CX_TEAM = 'CX_TEAM',
  PROVIDER = 'PROVIDER',
}

export enum RedFlagSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
}

export enum OnboardingStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum PersonaStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
}

export enum PhotoReviewStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum PrescriptionProofType {
  MEDICINE_BOX_LABEL = 'MEDICINE_BOX_LABEL',
  PRESCRIPTION_DOCUMENT = 'PRESCRIPTION_DOCUMENT',
  PHARMACY_RECORD = 'PHARMACY_RECORD',
  ORDER_CONFIRMATION = 'ORDER_CONFIRMATION',
}

export enum OnboardingStepKey {
  ID_PHOTO = 'ID_PHOTO',
  BODY_PHOTO = 'BODY_PHOTO',
  PRESCRIPTION_PROOF = 'PRESCRIPTION_PROOF',
}

export enum CheckInStatus {
  SCHEDULED = 'SCHEDULED',
  SENT = 'SENT',
  COMPLETED = 'COMPLETED',
}

export enum RefundStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

export enum ProductCategory {
  GLP1 = 'GLP1',
  ESTROGEN = 'ESTROGEN',
  PROGESTOGEN = 'PROGESTOGEN',
  TESTOSTERONE = 'TESTOSTERONE',
}

export enum ProductForm {
  INJECTION_PEN = 'INJECTION_PEN',
  INJECTION_VIAL = 'INJECTION_VIAL',
  GEL = 'GEL',
  PATCH = 'PATCH',
  TABLET = 'TABLET',
  CAPSULE = 'CAPSULE',
  SPRAY = 'SPRAY',
  PELLET = 'PELLET',
}

export enum PrescriptionStatus {
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  CANCELLED = 'CANCELLED',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  DISPATCHED = 'DISPATCHED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum CheckInOutcome {
  REPEAT = 'REPEAT',
  NEW_PRESCRIPTION = 'NEW_PRESCRIPTION',
  HOLD = 'HOLD',
  STOP = 'STOP',
}

export enum ConsentType {
  TELEHEALTH = 'TELEHEALTH',
}

export enum DoseStatus {
  SCHEDULED = 'SCHEDULED',
  TAKEN = 'TAKEN',
  MISSED = 'MISSED',
  SKIPPED = 'SKIPPED',
}

export interface QuizAnswer {
  questionId: string;
  question: string;
  answer: string;
}
