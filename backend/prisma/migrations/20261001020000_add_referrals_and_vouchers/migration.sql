-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONVERTED');

-- CreateEnum
CREATE TYPE "VoucherKind" AS ENUM ('REFERRER_REWARD', 'REFEREE_REWARD');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ISSUED', 'APPLIED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "referral_code" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "referral_code" TEXT,
ADD COLUMN     "voucher_auto_apply" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referred_lead_id" TEXT NOT NULL,
    "referred_patient_id" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "converted_at" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "kind" "VoucherKind" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'gbp',
    "status" "VoucherStatus" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_lead_id_key" ON "referrals"("referred_lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_patient_id_key" ON "referrals"("referred_patient_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "vouchers_patient_id_idx" ON "vouchers"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_referral_code_key" ON "patients"("referral_code");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_lead_id_fkey" FOREIGN KEY ("referred_lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_patient_id_fkey" FOREIGN KEY ("referred_patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

