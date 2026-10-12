-- CreateEnum
CREATE TYPE "BodyPhotoView" AS ENUM ('FRONT', 'SIDE');

-- CreateEnum
CREATE TYPE "PhotoCheckOutcome" AS ENUM ('PASS', 'FAIL', 'UNCHECKED');

-- CreateTable
CREATE TABLE "body_photo_checks" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "view" "BodyPhotoView" NOT NULL,
    "outcome" "PhotoCheckOutcome" NOT NULL,
    "issues" TEXT[],
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_photo_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "body_photo_checks_patient_id_view_created_at_idx" ON "body_photo_checks"("patient_id", "view", "created_at");

-- CreateIndex
CREATE INDEX "body_photo_checks_file_id_idx" ON "body_photo_checks"("file_id");

-- AddForeignKey
ALTER TABLE "body_photo_checks" ADD CONSTRAINT "body_photo_checks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
