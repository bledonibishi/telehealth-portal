-- When a courier's tracking API was last asked about this order's parcel.
ALTER TABLE "orders" ADD COLUMN "tracking_checked_at" TIMESTAMP(3);
