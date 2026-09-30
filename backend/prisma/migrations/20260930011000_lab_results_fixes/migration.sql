-- AlterTable
ALTER TABLE "lab_results" ADD COLUMN     "analyte_name" TEXT;

-- DropIndex
DROP INDEX "lab_results_patient_id_kind_collected_at_idx";

-- CreateIndex
CREATE INDEX "lab_results_patient_id_collected_at_idx" ON "lab_results"("patient_id", "collected_at");

-- CreateIndex
CREATE INDEX "lab_results_flagged_reviewed_at_collected_at_idx" ON "lab_results"("flagged", "reviewed_at", "collected_at");
