-- What happened to the patient's money when an order was cancelled.
ALTER TABLE "orders" ADD COLUMN "cancel_billing_note" TEXT;
