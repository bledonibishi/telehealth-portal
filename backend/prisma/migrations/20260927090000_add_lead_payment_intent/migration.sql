-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'PAYSERA');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "selected_plan_id" TEXT,
ADD COLUMN     "selected_plan_name" TEXT,
ADD COLUMN     "payment_method_requested" "PaymentMethod",
ADD COLUMN     "payment_requested_at" TIMESTAMP(3);
