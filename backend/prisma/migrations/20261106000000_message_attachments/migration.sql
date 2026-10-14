-- AlterTable
ALTER TABLE "uploaded_files" ADD COLUMN "message_id" TEXT;

-- CreateIndex
CREATE INDEX "uploaded_files_message_id_idx" ON "uploaded_files"("message_id");

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
