-- What the doctor wrote for the patient at review; printed on the check-in report. The internal note stays internal.
ALTER TABLE "check_ins" ADD COLUMN "patient_note" TEXT;
