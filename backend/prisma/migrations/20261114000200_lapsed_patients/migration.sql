-- Monthly emails to patients whose subscription ended, before their access is closed after six months.
ALTER TABLE "patients" ADD COLUMN "lapsed_emails_sent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lapsed_email_at" TIMESTAMP(3);
