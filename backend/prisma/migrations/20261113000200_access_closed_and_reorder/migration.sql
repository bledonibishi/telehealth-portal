-- Sign-in closed after a first-order refund; a "come back" supply that carries no second prescription fee.
ALTER TABLE "patients" ADD COLUMN "access_closed_at" TIMESTAMP(3),
ADD COLUMN "access_closed_reason" TEXT;
ALTER TABLE "orders" ADD COLUMN "reorder" BOOLEAN NOT NULL DEFAULT false;
