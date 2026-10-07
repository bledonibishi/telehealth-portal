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

/** Triage of a patient's answers: RED can't be treated online, ORANGE needs the doctor's closer look, GREEN is standard. */
export enum RiskTag {
  RED = 'RED',
  ORANGE = 'ORANGE',
  GREEN = 'GREEN',
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

/** Status of an identity-check session in verify-service. */
export enum IdentityVerificationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
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

/** Validated symptom questionnaires: Menopause Rating Scale (HRT), Aging Males' Symptoms scale (TRT). */
export enum SymptomScale {
  MRS = 'MRS',
  AMS = 'AMS',
}

export enum CheckInFeeling {
  GREAT = 'GREAT',
  GOOD = 'GOOD',
  OKAY = 'OKAY',
  DIFFICULTIES = 'DIFFICULTIES',
  NOT_WELL = 'NOT_WELL',
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

export enum LabResultKind {
  ESTRADIOL = 'ESTRADIOL',
  TESTOSTERONE = 'TESTOSTERONE',
  FSH = 'FSH',
  LH = 'LH',
  SHBG = 'SHBG',
  PSA = 'PSA',
  HEMATOCRIT = 'HEMATOCRIT',
  LIPID_PANEL = 'LIPID_PANEL',
  HBA1C = 'HBA1C',
  LIVER_FUNCTION = 'LIVER_FUNCTION',
  OTHER = 'OTHER',
}

export enum ReferralStatus {
  PENDING = 'PENDING',
  CONVERTED = 'CONVERTED',
}

export enum VoucherKind {
  REFERRER_REWARD = 'REFERRER_REWARD',
  REFEREE_REWARD = 'REFEREE_REWARD',
}

export enum VoucherStatus {
  ISSUED = 'ISSUED',
  APPLIED = 'APPLIED',
}

export interface QuizAnswer {
  questionId: string;
  question: string;
  answer: string;
}
