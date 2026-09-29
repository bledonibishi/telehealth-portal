-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('GLP1', 'ESTROGEN', 'PROGESTOGEN');

-- CreateEnum
CREATE TYPE "ProductForm" AS ENUM ('INJECTION_PEN', 'GEL', 'PATCH', 'TABLET', 'CAPSULE', 'SPRAY');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "prescriptions" DROP CONSTRAINT "prescriptions_consultation_id_fkey";

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "override_reason" TEXT,
ADD COLUMN     "patient_id" TEXT,
ADD COLUMN     "prescriber_id" TEXT,
ADD COLUMN     "refills_allowed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "supersedes_id" TEXT,
ADD COLUMN     "valid_until" TIMESTAMP(3),
ALTER COLUMN "consultation_id" DROP NOT NULL;

-- Backfill: every existing prescription came from a consultation, which
-- carries the patient and the clinician who approved it.
UPDATE "prescriptions" p
SET "patient_id" = c."patient_id", "prescriber_id" = c."clinician_id"
FROM "consultations" c
WHERE c."id" = p."consultation_id";

ALTER TABLE "prescriptions" ALTER COLUMN "patient_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescription_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "strength_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "directions" TEXT NOT NULL,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand_name" TEXT,
    "kind" "ConsultationKind" NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "form" "ProductForm" NOT NULL,
    "requires_cold_chain" BOOLEAN NOT NULL DEFAULT false,
    "weeks_per_step" INTEGER,
    "default_directions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_strengths" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pack_description" TEXT,
    "titration_step" INTEGER,
    "default_quantity" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_strengths_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_strengths_product_id_label_key" ON "product_strengths"("product_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_supersedes_id_key" ON "prescriptions"("supersedes_id");

-- CreateIndex
CREATE INDEX "prescriptions_patient_id_idx" ON "prescriptions"("patient_id");

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_prescriber_id_fkey" FOREIGN KEY ("prescriber_id") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_strength_id_fkey" FOREIGN KEY ("strength_id") REFERENCES "product_strengths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_strengths" ADD CONSTRAINT "product_strengths_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

