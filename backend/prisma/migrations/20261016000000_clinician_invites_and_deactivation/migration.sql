-- Team management: invite a clinician with a link, turn an account off without deleting its history.
ALTER TABLE "clinicians"
  ADD COLUMN "deactivated_at" TIMESTAMP(3),
  ADD COLUMN "password_set_at" TIMESTAMP(3),
  ADD COLUMN "invite_token" TEXT,
  ADD COLUMN "invite_token_expires_at" TIMESTAMP(3);

-- Everyone who exists chose (or was given) a password already.
UPDATE "clinicians" SET "password_set_at" = "created_at";

CREATE UNIQUE INDEX "clinicians_invite_token_key" ON "clinicians"("invite_token");
