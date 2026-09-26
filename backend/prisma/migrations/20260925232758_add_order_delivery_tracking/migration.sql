-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "out_for_delivery_at" TIMESTAMP(3),
ADD COLUMN     "tracking_number" TEXT,
ADD COLUMN     "tracking_url" TEXT;
