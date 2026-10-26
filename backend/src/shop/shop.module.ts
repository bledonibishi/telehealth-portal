import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { SHOP_PAYMENT_ADAPTERS, type ShopPaymentAdapter } from './payment-provider';
import { RaiAcceptAdapter } from './raiaccept.adapter';
import { StripeShopAdapter } from './stripe-shop.adapter';
import { DevPaymentAdapter } from './dev-payment.adapter';
import { BankTransferAdapter, CashOnDeliveryAdapter } from './offline-payment.adapters';
import { ShopService } from './shop.service';
import { ShopController, ShopCronController } from './shop.controller';
import { ShopAdminResolver } from './shop-admin.resolver';

/** The shop: products sold without a prescription, paid by card (RaiAccept, Stripe), on delivery or by bank transfer. */
@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [ShopController, ShopCronController],
  providers: [
    RaiAcceptAdapter,
    StripeShopAdapter,
    DevPaymentAdapter,
    CashOnDeliveryAdapter,
    BankTransferAdapter,
    // The order here is the order the buyer sees them in: cards first.
    {
      provide: SHOP_PAYMENT_ADAPTERS,
      useFactory: (raiAccept: RaiAcceptAdapter, stripe: StripeShopAdapter, dev: DevPaymentAdapter, cod: CashOnDeliveryAdapter, transfer: BankTransferAdapter): ShopPaymentAdapter[] => [raiAccept, stripe, dev, cod, transfer],
      inject: [RaiAcceptAdapter, StripeShopAdapter, DevPaymentAdapter, CashOnDeliveryAdapter, BankTransferAdapter],
    },
    ShopService,
    ShopAdminResolver,
  ],
  exports: [ShopService],
})
export class ShopModule {}
