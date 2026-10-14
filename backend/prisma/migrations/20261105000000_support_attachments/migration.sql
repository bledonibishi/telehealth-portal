-- AlterEnum
ALTER TYPE "UploadKind" ADD VALUE 'SUPPORT_ATTACHMENT';

-- AlterTable
ALTER TABLE "uploaded_files" ADD COLUMN "ticket_id" TEXT;

-- CreateIndex
CREATE INDEX "uploaded_files_ticket_id_idx" ON "uploaded_files"("ticket_id");

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
