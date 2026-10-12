-- One open refund request per patient. Prisma can't express a partial unique index in the schema, so it lives here.
CREATE UNIQUE INDEX "refund_requests_one_open_per_patient" ON "refund_requests"("patient_id") WHERE "status" = 'REQUESTED';
