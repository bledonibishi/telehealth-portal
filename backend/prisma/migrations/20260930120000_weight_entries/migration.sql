-- CreateEnum
CREATE TYPE "WeightEntrySource" AS ENUM ('PATIENT', 'STAFF');

-- CreateTable
CREATE TABLE "weight_entries" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "weight_kg" DECIMAL(4,1) NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "WeightEntrySource" NOT NULL DEFAULT 'PATIENT',
    "note" TEXT,
    "client_request_id" TEXT,
    "corrects_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "weight_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_corrects_id_key" ON "weight_entries"("corrects_id");

-- CreateIndex
CREATE INDEX "weight_entries_patient_id_measured_at_idx" ON "weight_entries"("patient_id", "measured_at");

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_patient_id_client_request_id_key" ON "weight_entries"("patient_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_corrects_id_fkey" FOREIGN KEY ("corrects_id") REFERENCES "weight_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A weighing must be a plausible human weight (same 30–300 kg bounds as the questionnaires).
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_weight_kg_range" CHECK ("weight_kg" BETWEEN 30 AND 300);

-- Append-only, like the audit log and consents — but an entry can be *voided* once
-- (voided_at NULL → set, with who/why). Nothing else about a row may ever change, and
-- rows can't be deleted, so history can't be rewritten by any client, not just the app.
CREATE OR REPLACE FUNCTION weight_entries_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'weight_entries is append-only: rows cannot be deleted';
  END IF;
  IF OLD."voided_at" IS NOT NULL THEN
    RAISE EXCEPTION 'weight_entries is append-only: a voided entry cannot be changed';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."patient_id" IS DISTINCT FROM OLD."patient_id"
     OR NEW."weight_kg" IS DISTINCT FROM OLD."weight_kg"
     OR NEW."measured_at" IS DISTINCT FROM OLD."measured_at"
     OR NEW."recorded_at" IS DISTINCT FROM OLD."recorded_at"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."note" IS DISTINCT FROM OLD."note"
     OR NEW."client_request_id" IS DISTINCT FROM OLD."client_request_id"
     OR NEW."corrects_id" IS DISTINCT FROM OLD."corrects_id" THEN
    RAISE EXCEPTION 'weight_entries is append-only: only voiding is allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER weight_entries_append_only
  BEFORE UPDATE OR DELETE ON "weight_entries"
  FOR EACH ROW EXECUTE FUNCTION weight_entries_guard();
CREATE TRIGGER weight_entries_no_truncate
  BEFORE TRUNCATE ON "weight_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

-- The Weight Journey reads a patient's completed check-ins by date.
CREATE INDEX "check_ins_patient_id_completed_at_idx" ON "check_ins"("patient_id", "completed_at");
