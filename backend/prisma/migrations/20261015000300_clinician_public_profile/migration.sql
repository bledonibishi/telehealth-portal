-- What patients see about a clinician on My Doctor.
ALTER TABLE "clinicians"
  ADD COLUMN "specialty" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
