-- Patients already declined before this status existed: close their onboarding too. Only where every consultation
-- was declined and the onboarding was never approved.
UPDATE "onboarding_submissions" o
SET "status" = 'DECLINED'
WHERE o."status" IN ('IN_PROGRESS', 'PENDING_REVIEW', 'REJECTED')
  AND EXISTS (SELECT 1 FROM "consultations" c WHERE c."patient_id" = o."patient_id")
  AND NOT EXISTS (SELECT 1 FROM "consultations" c WHERE c."patient_id" = o."patient_id" AND c."status" <> 'DECLINED');
