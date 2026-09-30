-- CreateEnum
CREATE TYPE "LabResultKind" AS ENUM ('ESTRADIOL', 'TESTOSTERONE', 'FSH', 'LH', 'SHBG', 'PSA', 'HEMATOCRIT', 'LIPID_PANEL', 'HBA1C', 'LIVER_FUNCTION', 'OTHER');

-- CreateTable
CREATE TABLE "lab_results" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "kind" "LabResultKind" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "reference_range_low" DOUBLE PRECISION,
    "reference_range_high" DOUBLE PRECISION,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "entered_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_results_patient_id_kind_collected_at_idx" ON "lab_results"("patient_id", "kind", "collected_at");

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
