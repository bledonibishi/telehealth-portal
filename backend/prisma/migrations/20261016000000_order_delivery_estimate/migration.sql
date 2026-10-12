-- The courier's expected delivery window for an order, set when the pharmacy ships it.
ALTER TABLE "orders" ADD COLUMN "estimated_delivery_from" TIMESTAMP(3),
ADD COLUMN "estimated_delivery_to" TIMESTAMP(3);
