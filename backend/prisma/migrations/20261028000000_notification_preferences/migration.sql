-- What a patient wants pushed to their phone, and whether an unread message is followed up by email.
ALTER TABLE "patients" ADD COLUMN "push_messages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "patients" ADD COLUMN "push_orders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "patients" ADD COLUMN "push_reminders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "patients" ADD COLUMN "push_rewards" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "patients" ADD COLUMN "email_unread_messages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "notifications" ADD COLUMN "emailed_at" TIMESTAMP(3);
CREATE INDEX "notifications_kind_read_at_emailed_at_idx" ON "notifications"("kind", "read_at", "emailed_at");
