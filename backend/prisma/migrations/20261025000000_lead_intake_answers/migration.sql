-- The medical questionnaire is answered on the website before payment and kept on the lead until it becomes a consultation.
ALTER TABLE "leads"
  ADD COLUMN "intake_answers" JSONB,
  ADD COLUMN "intake_consent_version" TEXT,
  ADD COLUMN "intake_consent_ip" TEXT,
  ADD COLUMN "intake_consent_user_agent" TEXT,
  ADD COLUMN "intake_saved_at" TIMESTAMP(3);
