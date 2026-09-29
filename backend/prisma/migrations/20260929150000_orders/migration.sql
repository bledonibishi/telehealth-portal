-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- Delivery details on the patient
ALTER TABLE "patients" ADD COLUMN "address_line1" TEXT,
ADD COLUMN "address_line2" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "postcode" TEXT;

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "prescription_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "shipping_address" JSONB,
    "pharmacy_ref" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "carrier" TEXT,
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "out_for_delivery_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- Each existing prescription was a single shipment: carry its fulfilment
-- history over as that prescription's first order.
INSERT INTO "orders" (
  "id", "prescription_id", "patient_id", "sequence", "status",
  "pharmacy_ref", "dispatched_at", "carrier", "tracking_number", "tracking_url",
  "out_for_delivery_at", "delivered_at", "created_at", "updated_at"
)
SELECT
  'ord_' || p."id", p."id", p."patient_id", 1,
  CASE
    WHEN p."delivered_at" IS NOT NULL THEN 'DELIVERED'::"OrderStatus"
    WHEN p."out_for_delivery_at" IS NOT NULL THEN 'OUT_FOR_DELIVERY'::"OrderStatus"
    WHEN p."dispatched_at" IS NOT NULL THEN 'DISPATCHED'::"OrderStatus"
    WHEN p."status" = 'CANCELLED' THEN 'CANCELLED'::"OrderStatus"
    ELSE 'PENDING'::"OrderStatus"
  END,
  p."pharmacy_ref", p."dispatched_at", p."carrier", p."tracking_number", p."tracking_url",
  p."out_for_delivery_at", p."delivered_at", p."issued_at", CURRENT_TIMESTAMP
FROM "prescriptions" p;

ALTER TABLE "prescriptions" DROP COLUMN "carrier",
DROP COLUMN "delivered_at",
DROP COLUMN "dispatched_at",
DROP COLUMN "out_for_delivery_at",
DROP COLUMN "pharmacy_ref",
DROP COLUMN "tracking_number",
DROP COLUMN "tracking_url";

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_prescription_id_sequence_key" ON "orders"("prescription_id", "sequence");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
