-- At most one unread notification per reader and group, so two events at the same moment join one row instead of each
-- creating their own. Prisma cannot express partial indexes, so this lives only in SQL.

-- Duplicates that already exist: keep the newest unread one, mark the older ones read.
UPDATE "notifications" n SET "read_at" = now()
WHERE n."read_at" IS NULL AND n."group_key" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "notifications" newer
  WHERE newer."read_at" IS NULL AND newer."group_key" = n."group_key"
    AND newer."patient_id" IS NOT DISTINCT FROM n."patient_id" AND newer."clinician_id" IS NOT DISTINCT FROM n."clinician_id"
    AND (newer."updated_at", newer."id") > (n."updated_at", n."id")
);

CREATE UNIQUE INDEX "notifications_open_patient_group_key" ON "notifications"("patient_id", "group_key")
  WHERE "read_at" IS NULL AND "group_key" IS NOT NULL AND "patient_id" IS NOT NULL;
CREATE UNIQUE INDEX "notifications_open_clinician_group_key" ON "notifications"("clinician_id", "group_key")
  WHERE "read_at" IS NULL AND "group_key" IS NOT NULL AND "clinician_id" IS NOT NULL;
