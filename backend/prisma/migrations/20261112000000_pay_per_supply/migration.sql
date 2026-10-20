-- A repeat supply for a patient who paid once is held until they pay for it.
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_PAYMENT' BEFORE 'PENDING';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "payment_invoice_id" TEXT,
ADD COLUMN "payment_url" TEXT,
ADD COLUMN "payment_amount_cents" INTEGER,
ADD COLUMN "payment_currency" TEXT,
ADD COLUMN "payment_reminder_at" TIMESTAMP(3),
ADD COLUMN "paid_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "patients" ADD COLUMN "pays_per_supply" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "orders_payment_invoice_id_key" ON "orders"("payment_invoice_id");
