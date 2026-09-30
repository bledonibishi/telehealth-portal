-- CreateEnum
CREATE TYPE "DoseStatus" AS ENUM ('SCHEDULED', 'TAKEN', 'MISSED', 'SKIPPED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "dose_interval_days" INTEGER;

-- CreateTable
CREATE TABLE "dose_events" (
    "id" TEXT NOT NULL,
    "prescription_item_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "DoseStatus" NOT NULL DEFAULT 'SCHEDULED',
    "taken_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dose_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dose_events_patient_id_scheduled_for_idx" ON "dose_events"("patient_id", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "dose_events_prescription_item_id_scheduled_for_key" ON "dose_events"("prescription_item_id", "scheduled_for");

-- AddForeignKey
ALTER TABLE "dose_events" ADD CONSTRAINT "dose_events_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "prescription_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dose_events" ADD CONSTRAINT "dose_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

