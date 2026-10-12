-- CreateEnum
CREATE TYPE "SideEffectSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "DeviceProvider" AS ENUM ('APPLE_HEALTH', 'GOOGLE_FIT', 'SMART_SCALE', 'OTHER');

-- AlterEnum
ALTER TYPE "UploadKind" ADD VALUE 'PROGRESS_PHOTO';

-- AlterEnum
ALTER TYPE "WeightEntrySource" ADD VALUE 'DEVICE';

-- AlterTable
ALTER TABLE "weight_entries" ADD COLUMN     "device_connection_id" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "photo_file_id" TEXT;

-- CreateTable
CREATE TABLE "device_connections" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "provider" "DeviceProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_hint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "device_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "side_effect_reports" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "effects" TEXT[],
    "severity" "SideEffectSeverity" NOT NULL,
    "note" TEXT,
    "medication" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" TEXT,

    CONSTRAINT "side_effect_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_connections_token_hash_key" ON "device_connections"("token_hash");

-- CreateIndex
CREATE INDEX "device_connections_patient_id_idx" ON "device_connections"("patient_id");

-- CreateIndex
CREATE INDEX "side_effect_reports_acknowledged_at_created_at_idx" ON "side_effect_reports"("acknowledged_at", "created_at");

-- CreateIndex
CREATE INDEX "side_effect_reports_patient_id_created_at_idx" ON "side_effect_reports"("patient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_photo_file_id_key" ON "weight_entries"("photo_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_device_connection_id_external_id_key" ON "weight_entries"("device_connection_id", "external_id");

-- AddForeignKey
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_device_connection_id_fkey" FOREIGN KEY ("device_connection_id") REFERENCES "device_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_connections" ADD CONSTRAINT "device_connections_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_effect_reports" ADD CONSTRAINT "side_effect_reports_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

