-- AlterTable
ALTER TABLE "partner_transmissions"
    ADD COLUMN "event" TEXT NOT NULL DEFAULT 'order.created',
    ADD COLUMN "targets" TEXT[],
    ADD COLUMN "next_attempt_at" TIMESTAMP(3),
    ADD COLUMN "claimed_at" TIMESTAMP(3);

-- Scalar lists must not be NULL for Prisma to read them.
UPDATE "partner_transmissions" SET "targets" = ARRAY[]::TEXT[];

-- DropIndex
DROP INDEX "partner_transmissions_status_idx";

-- CreateIndex
CREATE INDEX "partner_transmissions_status_next_attempt_at_idx" ON "partner_transmissions"("status", "next_attempt_at");
