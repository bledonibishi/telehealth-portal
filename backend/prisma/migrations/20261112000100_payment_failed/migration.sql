-- A failed renewal payment holds further supplies until a payment succeeds.
ALTER TABLE "patients" ADD COLUMN "payment_failed_at" TIMESTAMP(3);
