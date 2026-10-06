import { ObjectType, Field, Float, Int } from '@nestjs/graphql';

@ObjectType('PrescriptionProofFinding')
export class PrescriptionProofFindingModel {
  @Field({ description: 'INFO, WARNING or CRITICAL' })
  severity: string;

  @Field()
  message: string;
}

@ObjectType('PrescriptionProofIssue', { description: 'Something about the document the patient can fix by uploading another one' })
export class PrescriptionProofIssueModel {
  @Field({ description: 'e.g. NAME_MISMATCH, DOSE_MISSING, DATE_OLD, UNREADABLE' })
  code: string;

  @Field({ description: 'What to upload instead, in plain language' })
  patientHint: string;
}

@ObjectType('PrescriptionProofCheck', { description: 'One line of the patient-facing checklist' })
export class PrescriptionProofCheckModel {
  @Field({ description: 'NAME, MEDICINE, DOSE or DATE' })
  key: string;

  @Field({ description: 'PASS, FAIL (patient can act — see hint) or REVIEW (clinician will confirm)' })
  status: string;

  @Field({ nullable: true, description: 'What was read off the document' })
  value?: string;

  @Field({ nullable: true })
  hint?: string;
}

@ObjectType('PrescriptionProofReview', {
  description: 'Automatic read of the prescription proof and the dose-safety check. Advisory: the prescriber decides the dose.',
})
export class PrescriptionProofReviewModel {
  @Field({ description: 'COMPLETED, NOT_CONFIGURED, UNSUPPORTED_FILE or FAILED' })
  status: string;

  @Field({ nullable: true, description: 'Why the document was not read automatically' })
  reason?: string;

  @Field({ description: 'OK, UNVERIFIED, CAUTION or HIGH' })
  riskLevel: string;

  @Field({ description: 'Plain-language explanation shown to the patient' })
  patientMessage: string;

  @Field(() => [PrescriptionProofFindingModel])
  findings: PrescriptionProofFindingModel[];

  @Field(() => [PrescriptionProofIssueModel])
  documentIssues: PrescriptionProofIssueModel[];

  @Field(() => [PrescriptionProofCheckModel])
  checks: PrescriptionProofCheckModel[];

  @Field({ nullable: true, description: 'The medicine the patient gave in the questionnaire' })
  reportedMedicine?: string;

  @Field({ nullable: true, description: 'The dose the patient gave in the questionnaire' })
  reportedDoseLabel?: string;

  @Field({ nullable: true, description: 'When the patient says they last injected' })
  reportedLastDose?: string;

  @Field({ nullable: true, description: 'How long the patient says they have been on that dose' })
  reportedWeeksOnDose?: string;

  @Field({ nullable: true, description: 'DOCUMENT_CORRECT, STEPPED_UP_SINCE, STEPPED_DOWN_SINCE or NOT_SURE, when the patient answered the dose question' })
  doseClarification?: string;

  @Field(() => Int, { description: 'Checks that came back with document issues, across all uploads' })
  failedAttempts: number;

  @Field({ description: 'NONE, REUPLOAD, or CONTACT_US once re-uploading has not resolved the issues' })
  nextStep: string;

  @Field({ nullable: true })
  nameEvidenceUrl?: string;

  @Field({ nullable: true })
  nameEvidenceDocumentType?: string;

  @Field(() => [String])
  nameEvidenceNames: string[];

  @Field({ nullable: true })
  requestedDoseLabel?: string;

  @Field({ nullable: true, description: 'The highest dose the rules consider a safe next step' })
  suggestedDoseLabel?: string;

  @Field({ nullable: true, description: 'MATCH, MATCH_VIA_EVIDENCE, PARTIAL, MISMATCH or NOT_FOUND' })
  nameMatch?: string;

  @Field({ nullable: true })
  patientNameOnDocument?: string;

  @Field({ nullable: true })
  medicineName?: string;

  @Field(() => Float, { nullable: true })
  doseMg?: number;

  @Field({ nullable: true })
  documentDate?: string;

  @Field({ nullable: true })
  dateKind?: string;

  @Field({ nullable: true })
  notes?: string;

  @Field({ nullable: true })
  model?: string;

  @Field()
  reviewedAt: Date;
}
