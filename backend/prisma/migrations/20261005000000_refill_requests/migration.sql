-- CreateTable
CREATE TABLE "refill_requests" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "prescription_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "order_id" TEXT,

    CONSTRAINT "refill_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refill_requests_patient_id_idx" ON "refill_requests"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "refill_requests_prescription_id_sequence_key" ON "refill_requests"("prescription_id", "sequence");

-- AddForeignKey
ALTER TABLE "refill_requests" ADD CONSTRAINT "refill_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refill_requests" ADD CONSTRAINT "refill_requests_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
