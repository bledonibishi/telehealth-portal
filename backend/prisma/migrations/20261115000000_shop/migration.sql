-- The shop: products sold without a prescription, their orders, payments (RaiAccept or Stripe), refunds and the
-- fiscal receipts owed for them. New tables only; nothing existing changes.
-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ShopPaymentProvider" AS ENUM ('RAIACCEPT', 'STRIPE', 'DEV');

-- CreateEnum
CREATE TYPE "ShopPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FiscalReceiptStatus" AS ENUM ('PENDING', 'ISSUED');

-- CreateTable
CREATE TABLE "shop_products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT,
    "category" TEXT,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "max_per_order" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "shipping_address" JSONB NOT NULL,
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "provider" "ShopPaymentProvider" NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "shipping_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "refunded_cents" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "dispatched_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "carrier" TEXT,
    "tracking_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "shop_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "provider" "ShopPaymentProvider" NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "ShopPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_order_id" TEXT,
    "provider_transaction_id" TEXT,
    "redirect_url" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "card_summary" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_refunds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "provider_refund_id" TEXT,
    "reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_receipts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "FiscalReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "receipt_number" TEXT,
    "refund_id" TEXT,
    "issued_at" TIMESTAMP(3),
    "issued_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_slug_key" ON "shop_products"("slug");

-- CreateIndex
CREATE INDEX "shop_products_active_sort_order_idx" ON "shop_products"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_reference_key" ON "shop_orders"("reference");

-- CreateIndex
CREATE INDEX "shop_orders_status_expires_at_idx" ON "shop_orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "shop_orders_email_idx" ON "shop_orders"("email");

-- CreateIndex
CREATE INDEX "shop_orders_created_at_idx" ON "shop_orders"("created_at");

-- CreateIndex
CREATE INDEX "shop_order_items_order_id_idx" ON "shop_order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_payments_order_id_attempt_key" ON "shop_payments"("order_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "shop_payments_provider_provider_order_id_key" ON "shop_payments"("provider", "provider_order_id");

-- CreateIndex
CREATE INDEX "shop_refunds_order_id_idx" ON "shop_refunds"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_receipts_refund_id_key" ON "fiscal_receipts"("refund_id");

-- CreateIndex
CREATE INDEX "fiscal_receipts_status_created_at_idx" ON "fiscal_receipts"("status", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_receipts_order_id_idx" ON "fiscal_receipts"("order_id");

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_payments" ADD CONSTRAINT "shop_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_refunds" ADD CONSTRAINT "shop_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_refunds" ADD CONSTRAINT "shop_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "shop_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

