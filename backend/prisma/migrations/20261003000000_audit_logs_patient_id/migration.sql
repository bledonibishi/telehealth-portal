-- The audit trail becomes `audit_logs` (id, actor_id, action, patient_id, metadata, created_at, …).
-- Renaming keeps the rows and the append-only triggers from 20260929170000, which follow the table.
ALTER TABLE "audit_log_entries" RENAME TO "audit_logs";
ALTER TABLE "audit_logs" RENAME COLUMN "timestamp" TO "created_at";
ALTER TABLE "audit_logs" RENAME CONSTRAINT "audit_log_entries_pkey" TO "audit_logs_pkey";

-- Nullable: rows written before this migration have no patient_id (they are append-only,
-- so they are not backfilled — their resource_type/resource_id still identify the record).
ALTER TABLE "audit_logs" ADD COLUMN "patient_id" TEXT;

CREATE INDEX "audit_logs_patient_id_created_at_idx" ON "audit_logs"("patient_id", "created_at");

ALTER TRIGGER audit_log_entries_append_only ON "audit_logs" RENAME TO audit_logs_append_only;
ALTER TRIGGER audit_log_entries_no_truncate ON "audit_logs" RENAME TO audit_logs_no_truncate;
