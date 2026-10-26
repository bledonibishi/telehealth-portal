-- Pay on delivery and bank transfer for the shop: two payment types and the status of an order accepted to be paid on delivery.
-- AlterEnum
ALTER TYPE "ShopOrderStatus" ADD VALUE 'CONFIRMED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShopPaymentProvider" ADD VALUE 'COD';
ALTER TYPE "ShopPaymentProvider" ADD VALUE 'BANK_TRANSFER';

