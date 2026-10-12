-- Codes emailed to people starting the quiz, and the proof that they entered one.
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_salt" TEXT,
    "code_hash" TEXT,
    "code_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 1,
    "sent_window_start" TIMESTAMP(3) NOT NULL,
    "token_hash" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verifications_email_key" ON "email_verifications"("email");
