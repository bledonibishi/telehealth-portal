import { Args, Field, Float, ID, InputType, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { ShopOrderStatus } from '@prisma/client';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SALES, type AuthUser } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';
import { appError, ErrorCode } from '../common/errors/app-error';
import { ShopService } from './shop.service';

@ObjectType('ShopProduct')
export class ShopProductModel {
  @Field(() => ID) id: string;
  @Field() slug: string;
  @Field() name: string;
  @Field({ nullable: true }) brand?: string;
  @Field() description: string;
  @Field({ nullable: true }) imageUrl?: string;
  @Field({ nullable: true }) category?: string;
  @Field(() => Int, { description: 'Price the buyer pays, VAT included, in cents' }) priceCents: number;
  @Field() currency: string;
  @Field(() => Float, { description: 'VAT rate in the price, in percent' }) vatRate: number;
  @Field(() => Int, { description: 'Units left to sell; below zero when an order was paid after its hold lapsed' }) stock: number;
  @Field(() => Int) maxPerOrder: number;
  @Field() active: boolean;
  @Field(() => Int) sortOrder: number;
  @Field() updatedAt: Date;
}

@ObjectType('ShopOrderItem')
export class ShopOrderItemModel {
  @Field() name: string;
  @Field(() => Int) unitPriceCents: number;
  @Field(() => Int) quantity: number;
}

@ObjectType('ShopPayment')
export class ShopPaymentModel {
  @Field(() => ID) id: string;
  @Field({ description: 'RAIACCEPT, STRIPE or DEV' }) provider: string;
  @Field(() => Int) attempt: number;
  @Field({ description: 'PENDING, SUCCEEDED, FAILED or CANCELLED' }) status: string;
  @Field(() => Int) amountCents: number;
  @Field({ nullable: true, description: 'The provider’s id for this try, to find it in their portal' }) providerOrderId?: string;
  @Field({ nullable: true }) cardSummary?: string;
  @Field({ nullable: true }) failureMessage?: string;
  @Field({ nullable: true }) completedAt?: Date;
}

@ObjectType('ShopRefund')
export class ShopRefundModel {
  @Field(() => ID) id: string;
  @Field(() => ID, { description: 'The payment it gave money back from' }) paymentId: string;
  @Field(() => Int) amountCents: number;
  @Field({ nullable: true }) reason?: string;
  @Field() createdAt: Date;
}

@ObjectType('FiscalReceipt')
export class FiscalReceiptModel {
  @Field(() => ID) id: string;
  @Field({ description: 'SALE, or REFUND for a correcting receipt' }) kind: string;
  @Field(() => Int) amountCents: number;
  @Field() currency: string;
  @Field({ description: 'PENDING or ISSUED' }) status: string;
  @Field({ nullable: true }) receiptNumber?: string;
  @Field({ nullable: true }) issuedAt?: Date;
  @Field() createdAt: Date;
  @Field({ nullable: true }) orderReference?: string;
  @Field({ nullable: true }) buyerName?: string;
}

@ObjectType('ShopOrder')
export class ShopOrderModel {
  @Field(() => ID) id: string;
  @Field() reference: string;
  @Field({ description: 'AWAITING_PAYMENT, CONFIRMED (to be paid on delivery), PAID, DISPATCHED, DELIVERED, CANCELLED or REFUNDED' }) status: string;
  @Field({ description: 'How the buyer chose to pay: RAIACCEPT, STRIPE, COD, BANK_TRANSFER or DEV' }) provider: string;
  @Field() email: string;
  @Field() firstName: string;
  @Field() lastName: string;
  @Field({ nullable: true }) phone?: string;
  @Field({ description: 'Street, city, postal code and country on one line' }) address: string;
  @Field(() => Int) subtotalCents: number;
  @Field(() => Int) shippingCents: number;
  @Field(() => Int) totalCents: number;
  @Field(() => Int) refundedCents: number;
  @Field() currency: string;
  @Field() createdAt: Date;
  @Field({ nullable: true }) paidAt?: Date;
  @Field({ nullable: true }) dispatchedAt?: Date;
  @Field({ nullable: true }) deliveredAt?: Date;
  @Field({ nullable: true }) cancelledAt?: Date;
  @Field({ nullable: true }) cancelReason?: string;
  @Field({ nullable: true }) carrier?: string;
  @Field({ nullable: true }) trackingNumber?: string;
  @Field({ description: 'True when more than one try was paid: one must be refunded' }) paidTwice: boolean;
  @Field(() => [ShopOrderItemModel]) items: ShopOrderItemModel[];
  @Field(() => [ShopPaymentModel]) payments: ShopPaymentModel[];
  @Field(() => [ShopRefundModel]) refunds: ShopRefundModel[];
  @Field(() => [FiscalReceiptModel]) fiscalReceipts: FiscalReceiptModel[];
}

@InputType()
export class ShopProductInput {
  @Field(() => ID, { nullable: true, description: 'Leave out to add a product' }) id?: string;
  @Field() slug: string;
  @Field() name: string;
  @Field({ nullable: true }) brand?: string;
  @Field({ nullable: true }) description?: string;
  @Field({ nullable: true }) imageUrl?: string;
  @Field({ nullable: true }) category?: string;
  @Field(() => Int) priceCents: number;
  @Field(() => Float) vatRate: number;
  @Field(() => Int) stock: number;
  @Field(() => Int) maxPerOrder: number;
  @Field() active: boolean;
  @Field(() => Int, { nullable: true }) sortOrder?: number;
}

@InputType()
export class ShopRefundInput {
  @Field(() => ID) orderId: string;
  @Field(() => ID, { nullable: true, description: 'Which payment to refund (an order paid twice has two); leave out for the first with money left' }) paymentId?: string;
  @Field(() => Int, { nullable: true, description: 'In cents; leave out to refund everything left on that payment' }) amountCents?: number;
  @Field({ nullable: true }) reason?: string;
  @Field({ nullable: true, description: 'Put the items back on sale (full refund of an order that hasn’t shipped)' }) restock?: boolean;
}

const ADMIN = [ClinicianRole.ADMIN];

const toProduct = (p: any): ShopProductModel => ({ ...p, vatRate: Number(p.vatRate) });

function toOrder(o: any): ShopOrderModel {
  const a = o.shippingAddress ?? {};
  return {
    ...o,
    address: [a.line1, a.city, a.postalCode, a.country].filter(Boolean).join(', '),
    paidTwice: o.payments.filter((p: any) => p.status === 'SUCCEEDED').length > 1,
    fiscalReceipts: o.fiscalReceipts ?? [],
    refunds: o.refunds ?? [],
  };
}

/**
 * The shop for staff. Sales and support (ADMIN, CX_TEAM) see the orders and record fiscal receipts; only an admin
 * changes products, ships, refunds or cancels.
 */
@Resolver()
export class ShopAdminResolver {
  constructor(private shop: ShopService) {}

  @Query(() => [ShopProductModel])
  @Authorized(...ADMIN)
  async shopProducts() {
    return (await this.shop.allProducts()).map(toProduct);
  }

  @Query(() => [ShopOrderModel])
  @Authorized(...SALES)
  async shopOrders(@Args('status', { nullable: true }) status?: string, @Args('search', { nullable: true }) search?: string) {
    if (status && !(status in ShopOrderStatus)) throw appError(ErrorCode.VALIDATION_FAILED, 'Unknown order status');
    return (await this.shop.listOrders({ status: status as ShopOrderStatus | undefined, search })).map(toOrder);
  }

  @Query(() => [FiscalReceiptModel], { description: 'Sales and refunds still waiting for their fiscal receipt' })
  @Authorized(...SALES)
  async pendingFiscalReceipts() {
    return (await this.shop.pendingFiscalReceipts()).map((r) => ({ ...r, orderReference: r.order.reference, buyerName: `${r.order.firstName} ${r.order.lastName}` }));
  }

  @Mutation(() => ShopProductModel)
  @Authorized(...ADMIN)
  async saveShopProduct(@Args('input') input: ShopProductInput, @CurrentUser() user: AuthUser) {
    return toProduct(await this.shop.saveProduct(input, user.id));
  }

  @Mutation(() => ShopOrderModel)
  @Authorized(...ADMIN)
  async markShopOrderDispatched(
    @Args('orderId', { type: () => ID }) orderId: string,
    @Args('carrier', { nullable: true }) carrier: string | undefined,
    @Args('trackingNumber', { nullable: true }) trackingNumber: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    await this.shop.markDispatched(orderId, { carrier, trackingNumber }, user.id);
    return this.one(orderId);
  }

  @Mutation(() => ShopOrderModel)
  @Authorized(...ADMIN)
  async markShopOrderDelivered(@Args('orderId', { type: () => ID }) orderId: string, @CurrentUser() user: AuthUser) {
    await this.shop.markDelivered(orderId, user.id);
    return this.one(orderId);
  }

  @Mutation(() => ShopOrderModel)
  @Authorized(...ADMIN)
  async cancelShopOrder(@Args('orderId', { type: () => ID }) orderId: string, @Args('reason') reason: string, @CurrentUser() user: AuthUser) {
    await this.shop.cancelByStaff(orderId, reason, user.id);
    return this.one(orderId);
  }

  @Mutation(() => ShopOrderModel)
  @Authorized(...ADMIN)
  async refundShopOrder(@Args('input') input: ShopRefundInput, @CurrentUser() user: AuthUser) {
    await this.shop.refund(input.orderId, input, user.id);
    return this.one(input.orderId);
  }

  @Mutation(() => ShopOrderModel, { description: 'The courier handed over a pay-on-delivery payment, or a bank transfer arrived' })
  @Authorized(...SALES)
  async markShopPaymentReceived(@Args('orderId', { type: () => ID }) orderId: string, @CurrentUser() user: AuthUser) {
    await this.shop.markPaymentReceived(orderId, user.id);
    return this.one(orderId);
  }

  @Mutation(() => FiscalReceiptModel)
  @Authorized(...SALES)
  async markFiscalReceiptIssued(@Args('id', { type: () => ID }) id: string, @Args('receiptNumber') receiptNumber: string, @CurrentUser() user: AuthUser) {
    const r = await this.shop.markFiscalReceiptIssued(id, receiptNumber, user.id);
    return { ...r, orderReference: r.order.reference, buyerName: `${r.order.firstName} ${r.order.lastName}` };
  }

  private async one(orderId: string) {
    const order = await this.shop.orderForStaff(orderId);
    return toOrder(order);
  }
}
