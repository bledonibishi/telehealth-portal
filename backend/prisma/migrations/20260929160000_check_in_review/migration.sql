-- CreateEnum
CREATE TYPE "CheckInOutcome" AS ENUM ('REPEAT', 'NEW_PRESCRIPTION', 'HOLD', 'STOP');

-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "billing_note" TEXT,
ADD COLUMN     "kind" "ConsultationKind",
ADD COLUMN     "outcome" "CheckInOutcome",
ADD COLUMN     "prescription_id" TEXT,
ADD COLUMN     "questionnaire_version" TEXT,
ADD COLUMN     "red_flags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "result_order_id" TEXT,
ADD COLUMN     "result_prescription_id" TEXT,
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

