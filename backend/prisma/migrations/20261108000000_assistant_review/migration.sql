-- AlterTable
ALTER TABLE "messages" ADD COLUMN "ai_article_id" TEXT,
ADD COLUMN "ai_feedback" TEXT,
ADD COLUMN "ai_feedback_note" TEXT,
ADD COLUMN "ai_feedback_by_id" TEXT,
ADD COLUMN "ai_feedback_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "support_threads" ADD COLUMN "escalation_reason" TEXT,
ADD COLUMN "escalated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "support_articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "handoff" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_articles_pkey" PRIMARY KEY ("id")
);
