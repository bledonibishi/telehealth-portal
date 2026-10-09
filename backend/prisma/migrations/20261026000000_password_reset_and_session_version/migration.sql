-- Lets a password change or "sign out everywhere" end sessions that are already open.
ALTER TABLE "clinicians" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "patients" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- Single-use "forgot password" links, stored as a hash.
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");
CREATE INDEX "password_resets_account_type_account_id_idx" ON "password_resets"("account_type", "account_id");
