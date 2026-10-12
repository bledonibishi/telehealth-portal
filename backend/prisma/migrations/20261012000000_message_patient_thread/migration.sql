-- Every message belongs to a patient; a consultation is optional (messages
-- sent before the medical questionnaire is submitted).

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "patient_id" TEXT;

-- Backfill from each message's consultation
UPDATE "messages" m SET "patient_id" = c."patient_id" FROM "consultations" c WHERE m."consultation_id" = c."id";

ALTER TABLE "messages" ALTER COLUMN "patient_id" SET NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "consultation_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "messages_patient_id_consultation_id_idx" ON "messages"("patient_id", "consultation_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
