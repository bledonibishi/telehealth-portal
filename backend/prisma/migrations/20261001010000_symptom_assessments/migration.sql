-- CreateEnum
CREATE TYPE "SymptomScale" AS ENUM ('MRS', 'AMS');

-- CreateTable
CREATE TABLE "symptom_assessments" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "scale" "SymptomScale" NOT NULL,
    "answers" JSONB NOT NULL,
    "total_score" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "symptom_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "symptom_assessments_patient_id_recorded_at_idx" ON "symptom_assessments"("patient_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "symptom_assessments" ADD CONSTRAINT "symptom_assessments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
