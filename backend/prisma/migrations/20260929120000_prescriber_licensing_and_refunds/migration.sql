-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NOT_REQUIRED', 'REFUNDED', 'FAILED');

-- Clinician licence: rename the UK-specific GMC number rather than dropping it,
-- so existing values carry over. GMC is recorded as the licensing body for them.
ALTER TABLE "clinicians" RENAME COLUMN "gmc_number" TO "license_number";
ALTER INDEX "clinicians_gmc_number_key" RENAME TO "clinicians_license_number_key";
ALTER TABLE "clinicians" ADD COLUMN "licensing_body" TEXT,
ADD COLUMN "verified_at" TIMESTAMP(3),
ADD COLUMN "verified_by_id" TEXT;
UPDATE "clinicians" SET "licensing_body" = 'GMC' WHERE "license_number" IS NOT NULL;

-- AlterTable
ALTER TABLE "consultations" ADD COLUMN "decline_reason" TEXT,
ADD COLUMN "refund_status" "RefundStatus";

-- AlterTable
ALTER TABLE "patients" ADD COLUMN "stripe_customer_id" TEXT,
ADD COLUMN "stripe_subscription_id" TEXT;
