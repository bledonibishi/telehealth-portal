-- The admin audit log lists every entry newest first.
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
