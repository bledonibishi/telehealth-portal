-- AlterTable
ALTER TABLE "messages" ADD COLUMN "read_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "messages_consultation_id_read_at_idx" ON "messages"("consultation_id", "read_at");
