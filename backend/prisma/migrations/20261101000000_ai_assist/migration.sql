-- AI assistance for staff: a store of what the AI produced (briefs, translations), and an urgency mark on messages. Additive.
CREATE TABLE "ai_outputs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_outputs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_outputs_kind_subject_id_input_hash_key" ON "ai_outputs"("kind", "subject_id", "input_hash");
CREATE INDEX "ai_outputs_subject_id_idx" ON "ai_outputs"("subject_id");

ALTER TABLE "messages" ADD COLUMN "ai_urgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "ai_urgent_reason" TEXT;
ALTER TABLE "messages" ADD COLUMN "ai_checked_at" TIMESTAMP(3);
