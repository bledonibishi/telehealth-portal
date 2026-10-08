-- When the pharmacy has packed an order and is waiting for the courier.
ALTER TABLE "orders" ADD COLUMN "ready_for_pickup_at" TIMESTAMP(3);

-- The history of an order's journey, from staff or from a courier / tracking service.
CREATE TABLE "order_tracking_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_tracking_events_order_id_occurred_at_idx" ON "order_tracking_events"("order_id", "occurred_at");

CREATE UNIQUE INDEX "order_tracking_events_order_id_external_id_key" ON "order_tracking_events"("order_id", "external_id");

ALTER TABLE "order_tracking_events" ADD CONSTRAINT "order_tracking_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
