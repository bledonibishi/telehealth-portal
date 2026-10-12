-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'REJECTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'CALCOM',
    "provider_uid" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "reference_id" TEXT,
    "patient_id" TEXT,
    "clinician_id" TEXT,
    "host_name" TEXT,
    "host_email" TEXT,
    "attendee_name" TEXT,
    "attendee_email" TEXT,
    "title" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "meeting_url" TEXT,
    "location" TEXT,
    "cancel_reason" TEXT,
    "rescheduled_from_uid" TEXT,
    "provider_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_provider_uid_key" ON "bookings"("provider_uid");

-- CreateIndex
CREATE INDEX "bookings_patient_id_starts_at_idx" ON "bookings"("patient_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_purpose_reference_id_idx" ON "bookings"("purpose", "reference_id");

-- CreateIndex
CREATE INDEX "bookings_starts_at_idx" ON "bookings"("starts_at");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_clinician_id_fkey" FOREIGN KEY ("clinician_id") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
