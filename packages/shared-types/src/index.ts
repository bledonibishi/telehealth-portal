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

export interface QuizAnswer {
  questionId: string;
  question: string;
  answer: string;
}
