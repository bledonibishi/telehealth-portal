-- CreateTable
CREATE TABLE "refund_requests" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "outcome" TEXT,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_requests_status_requested_at_idx" ON "refund_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "refund_requests_patient_id_idx" ON "refund_requests"("patient_id");

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
