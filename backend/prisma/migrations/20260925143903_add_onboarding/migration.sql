-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('ID_DOCUMENT', 'SELFIE', 'BODY_PHOTO_FRONT', 'BODY_PHOTO_SIDE', 'PRESCRIPTION_PROOF');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PersonaStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "PhotoReviewStatus" AS ENUM ('NOT_STARTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrescriptionProofType" AS ENUM ('MEDICINE_BOX_LABEL', 'PRESCRIPTION_DOCUMENT', 'PHARMACY_RECORD', 'ORDER_CONFIRMATION');

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_submissions" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "id_document_file_id" TEXT,
    "selfie_file_id" TEXT,
    "persona_status" "PersonaStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "body_photo_front_file_id" TEXT,
    "body_photo_side_file_id" TEXT,
    "photo_review_status" "PhotoReviewStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "prior_medication_use" BOOLEAN,
    "prescription_proof_type" "PrescriptionProofType",
    "prescription_proof_file_id" TEXT,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_clinician_id" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_submissions_patient_id_key" ON "onboarding_submissions"("patient_id");

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_reviewed_by_clinician_id_fkey" FOREIGN KEY ("reviewed_by_clinician_id") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
