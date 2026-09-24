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

export interface QuizAnswer {
  questionId: string;
  question: string;
  answer: string;
}
