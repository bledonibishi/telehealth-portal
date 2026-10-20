-- A refund that waits for the parcel on its way to the patient to come back before the money is returned.
ALTER TABLE "refund_requests" ADD COLUMN "awaiting_order_id" TEXT,
ADD COLUMN "awaiting_end_subscription" BOOLEAN NOT NULL DEFAULT true;
