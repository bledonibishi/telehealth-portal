-- Lab reports: the file a patient or doctor attached, and the results typed from it. Additive.
ALTER TYPE "UploadKind" ADD VALUE 'LAB_REPORT';

CREATE TYPE "LabReportSource" AS ENUM ('PATIENT', 'STAFF');
CREATE TYPE "LabReportStatus" AS ENUM ('PENDING', 'ENTERED', 'REJECTED');

CREATE TABLE "lab_reports" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "source" "LabReportSource" NOT NULL,
    "status" "LabReportStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "uploaded_by_id" TEXT,
    "handled_by_id" TEXT,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_reports_file_id_key" ON "lab_reports"("file_id");
CREATE INDEX "lab_reports_patient_id_created_at_idx" ON "lab_reports"("patient_id", "created_at");
CREATE INDEX "lab_reports_status_created_at_idx" ON "lab_reports"("status", "created_at");

ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "uploaded_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lab_results" ADD COLUMN "report_id" TEXT;
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "lab_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
