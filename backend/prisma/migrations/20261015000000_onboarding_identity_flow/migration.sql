-- AlterTable
ALTER TABLE "onboarding_submissions" ADD COLUMN "identity_via_verify_service" BOOLEAN NOT NULL DEFAULT false;

-- Submissions already sent while the patient had an identity check in verify-service were on that
-- flow (the rule used until now: any session for the patient).
UPDATE "onboarding_submissions" o
SET "identity_via_verify_service" = true
WHERE o."status" <> 'IN_PROGRESS'
  AND EXISTS (SELECT 1 FROM "identity_verifications" iv WHERE iv."patient_id" = o."patient_id");
