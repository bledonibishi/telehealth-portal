-- Extra live consultations a patient chooses to book can carry a fee, paid before a doctor sees the request.
ALTER TYPE "AppointmentStatus" ADD VALUE 'AWAITING_PAYMENT' BEFORE 'REQUESTED';
ALTER TABLE "appointment_requests" ADD COLUMN "payment_invoice_id" TEXT,
ADD COLUMN "payment_url" TEXT,
ADD COLUMN "payment_amount_cents" INTEGER,
ADD COLUMN "payment_currency" TEXT,
ADD COLUMN "paid_at" TIMESTAMP(3);
