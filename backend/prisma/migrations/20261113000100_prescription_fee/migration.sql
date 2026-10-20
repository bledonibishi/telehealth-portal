-- What a patient's first payment charged as prescription fee (null: before the fee existed).
ALTER TABLE "patients" ADD COLUMN "prescription_fee_paid_cents" INTEGER;
