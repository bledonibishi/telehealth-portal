-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TELEHEALTH');

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consents_patient_id_type_idx" ON "consents"("patient_id", "type");

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The audit log and consent records are evidence: rows can be added, never
-- changed or removed — enforced here so it holds for every client, not just the app.
CREATE OR REPLACE FUNCTION forbid_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_entries_append_only
  BEFORE UPDATE OR DELETE ON "audit_log_entries"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER audit_log_entries_no_truncate
  BEFORE TRUNCATE ON "audit_log_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER consents_append_only
  BEFORE UPDATE OR DELETE ON "consents"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER consents_no_truncate
  BEFORE TRUNCATE ON "consents"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();
