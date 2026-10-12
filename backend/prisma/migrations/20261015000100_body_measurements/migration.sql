-- CreateTable
CREATE TABLE "body_measurements" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waist_cm" DECIMAL(4,1),
    "hips_cm" DECIMAL(4,1),
    "arm_cm" DECIMAL(4,1),
    "client_request_id" TEXT,
    "voided_at" TIMESTAMP(3),

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "body_measurements_patient_id_measured_at_idx" ON "body_measurements"("patient_id", "measured_at");

-- CreateIndex
CREATE UNIQUE INDEX "body_measurements_patient_id_client_request_id_key" ON "body_measurements"("patient_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An entry has at least one measurement, each a plausible human size in centimetres.
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_has_value" CHECK ("waist_cm" IS NOT NULL OR "hips_cm" IS NOT NULL OR "arm_cm" IS NOT NULL);
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_range" CHECK (
  ("waist_cm" IS NULL OR "waist_cm" BETWEEN 30 AND 250)
  AND ("hips_cm" IS NULL OR "hips_cm" BETWEEN 40 AND 250)
  AND ("arm_cm" IS NULL OR "arm_cm" BETWEEN 10 AND 100)
);
