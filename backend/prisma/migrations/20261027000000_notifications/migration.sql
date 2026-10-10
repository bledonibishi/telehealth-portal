-- A per-person notification inbox for patients and staff, with read state and grouping.
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT,
    "clinician_id" TEXT,
    "kind" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "href" TEXT,
    "group_key" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_one_recipient" CHECK (("patient_id" IS NULL) <> ("clinician_id" IS NULL))
);
CREATE INDEX "notifications_patient_id_updated_at_idx" ON "notifications"("patient_id", "updated_at");
CREATE INDEX "notifications_clinician_id_updated_at_idx" ON "notifications"("clinician_id", "updated_at");
CREATE INDEX "notifications_group_key_read_at_idx" ON "notifications"("group_key", "read_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_clinician_id_fkey" FOREIGN KEY ("clinician_id") REFERENCES "clinicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
