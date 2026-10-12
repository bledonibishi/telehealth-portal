-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "AppointmentReason" AS ENUM ('QUESTION', 'CHECK_UP', 'SIDE_EFFECT', 'PAIN', 'DOSE_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentUrgency" AS ENUM ('ROUTINE', 'URGENT');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "patients" ADD COLUMN "gender" "Gender",
ADD COLUMN "height_cm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "appointment_requests" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "reason" "AppointmentReason" NOT NULL,
    "details" TEXT NOT NULL,
    "pain_level" INTEGER,
    "red_flags" TEXT[],
    "urgency" "AppointmentUrgency" NOT NULL,
    "emergency_advised" BOOLEAN NOT NULL DEFAULT false,
    "preferred_times" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "respond_by" TIMESTAMP(3) NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "meeting_url" TEXT,
    "clinician_note" TEXT,
    "handled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_requests_status_urgency_respond_by_idx" ON "appointment_requests"("status", "urgency", "respond_by");

-- CreateIndex
CREATE INDEX "appointment_requests_patient_id_created_at_idx" ON "appointment_requests"("patient_id", "created_at");

-- AddForeignKey
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
