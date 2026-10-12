-- CreateEnum
CREATE TYPE "PartnerTransmissionStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "partner_transmissions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "PartnerTransmissionStatus" NOT NULL DEFAULT 'PENDING',
    "channels" TEXT[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_transmissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_transmissions_order_id_key" ON "partner_transmissions"("order_id");

-- CreateIndex
CREATE INDEX "partner_transmissions_status_idx" ON "partner_transmissions"("status");

-- AddForeignKey
ALTER TABLE "partner_transmissions" ADD CONSTRAINT "partner_transmissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
