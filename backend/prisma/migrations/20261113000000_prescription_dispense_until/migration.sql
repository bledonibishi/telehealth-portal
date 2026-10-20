-- The last day a pharmacy may fill a prescription (15 days after issue). Older prescriptions keep valid_until.
ALTER TABLE "prescriptions" ADD COLUMN "dispense_until" TIMESTAMP(3);
