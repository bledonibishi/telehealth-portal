-- Paid consultations: refunded when cancelled in time, or when the doctor could not make it and the patient chose a refund.
ALTER TABLE "appointment_requests" ADD COLUMN "refunded_at" TIMESTAMP(3),
ADD COLUMN "refund_id" TEXT,
ADD COLUMN "refund_offered_at" TIMESTAMP(3);
