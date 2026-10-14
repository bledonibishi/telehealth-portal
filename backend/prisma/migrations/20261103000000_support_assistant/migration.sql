-- CreateEnum
CREATE TYPE "SupportThreadStatus" AS ENUM ('ACTIVE', 'AWAITING_PATIENT', 'ESCALATED', 'DONE');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "is_ai" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "support_threads" (
    "id" TEXT NOT NULL,
    "thread_key" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "consultation_id" TEXT,
    "status" "SupportThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "reply_due_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ticket_id" TEXT,
    "awaiting_since" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_threads_thread_key_key" ON "support_threads"("thread_key");

-- CreateIndex
CREATE INDEX "support_threads_status_reply_due_at_idx" ON "support_threads"("status", "reply_due_at");
