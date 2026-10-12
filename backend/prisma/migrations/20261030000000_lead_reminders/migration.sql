-- Reminders to leads who answered the questions but never paid: how many were sent, when the last went, and when the
-- lead asked not to get any more. Additive: existing leads start at none sent.
ALTER TABLE "leads" ADD COLUMN "reminder_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "leads" ADD COLUMN "last_reminder_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "reminders_stopped_at" TIMESTAMP(3);
