-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "engineering_sent_at" TIMESTAMP(3),
ADD COLUMN "engineering_sent_by_id" TEXT,
ADD COLUMN "engineering_note" TEXT,
ADD COLUMN "engineering_done_at" TIMESTAMP(3);
