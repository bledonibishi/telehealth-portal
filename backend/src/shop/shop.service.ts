import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ShopOrderStatus, ShopPaymentProvider, ShopPaymentStatus, type ShopOrder, type ShopPayment } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { ErrorCode, appError, warning } from '../common/errors/app-error';
import { PaymentProviderError, SHOP_PAYMENT_ADAPTERS, type PaymentState, type ShopAddress, type ShopPaymentAdapter } from './payment-provider';
import { HOLD_MINUTES, isQuote, normalizeCart, quote, shopSettings, type Quote, type ShopSettings } from './shop-pricing';
import type { BankTransferAdapter } from './offline-payment.adapters';

export interface CreateShopOrderInput {
  items?: Array<{ productId?: unknown; quantity?: unknown }>;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: Partial<ShopAddress>;
  provider?: string;
  /** The total the buyer saw. When it no longer matches, they are shown the new one before paying. */
  expectedTotalCents?: number;
}

type OrderWithDetails = ShopOrder & {
  items: Array<{ productId: string; name: string; unitPriceCents: number; quantity: number }>;
  payments: ShopPayment[];
};

const ORDER_DETAILS = { items: true, payments: { orderBy: { attempt: 'asc' } } } as const;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

// No 0/O or 1/I: the reference is read out on the phone.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newReference = () => `OMO-${Array.from(crypto.randomBytes(6), (b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('')}`;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The shop: products sold without a prescription, paid by card through RaiAccept (Raiffeisen) or Stripe.
 *
 * An order holds its stock from the moment it is created until it is paid or its hold lapses. It counts as paid only
 * once the provider, asked by us, says the try succeeded for the amount, currency and reference we asked for: never
 * because a notification or the buyer's return to the website says so.
 */
@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private email: EmailService,
    private audit: AuditService,
    @Inject(SHOP_PAYMENT_ADAPTERS) private adapters: ShopPaymentAdapter[],
  ) {}

  // ── What the website shows ────────────────────────────────────────────────────────────────────────────────

  async products() {
    const products = await this.prisma.shopProduct.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return products.map(publicProduct);
  }

  async product(slug: string) {
    const product = await this.prisma.shopProduct.findFirst({ where: { slug, active: true } });
    if (!product) throw new NotFoundException('We couldn’t find that product. It may no longer be sold.');
    return publicProduct(product);
  }

  /** How the buyer can pay, the delivery charge and where the shop delivers. */
  checkoutOptions() {
    const settings = shopSettings(this.config);
    // SHOP_PAYMENT_PROVIDERS picks which ways of paying the shop offers, e.g. RAIACCEPT,COD,BANK_TRANSFER (Stripe can
    // stay for subscriptions only). The test card payment stands in only while no real card payment is set up, so it
    // never sits next to a real one.
    const enabled = (this.config.get<string>('SHOP_PAYMENT_PROVIDERS') || 'RAIACCEPT,STRIPE').split(',').map((k) => k.trim().toUpperCase());
    const live = this.adapters.filter((a) => a.key !== ShopPaymentProvider.DEV && enabled.includes(a.key) && a.isConfigured());
    const testCard = !live.some((a) => a.kind === 'CARD');
    const offered = this.adapters.filter((a) => (a.key === ShopPaymentProvider.DEV ? testCard && a.isConfigured() : live.includes(a)));
    return { ...settings, paymentMethods: offered.map((a) => ({ key: a.key, kind: a.kind, label: a.label, description: a.description })) };
  }

  // ── Buying ───────────────────────────────────────────────────────────────────────────────────────────────

  /** Checks the order, holds its stock and opens the chosen provider's payment page. Returns where to send the buyer. */
  async createOrder(input: CreateShopOrderInput) {
    const settings = shopSettings(this.config);
    const buyer = this.checkBuyer(input, settings.countries);
    const adapter = this.adapterFor(input.provider);

    const cart = normalizeCart(input.items);
    const products = await this.prisma.shopProduct.findMany({ where: { id: { in: cart.map((c) => c.productId) } } });
    const priced = quote(cart, products, settings);
    if (!isQuote(priced)) throw quoteError(priced);
    if (typeof input.expectedTotalCents === 'number' && input.expectedTotalCents !== priced.totalCents) {
      throw appError(ErrorCode.SHOP_PRICE_CHANGED, undefined, { severity: 'warning' });
    }
    checkCodLimit(adapter, priced.totalCents, settings);
    checkCodPhone(adapter, buyer.phone);

    const token = crypto.randomBytes(24).toString('base64url');
    const order = await this.prisma.$transaction(async (tx) => {
      await holdStock(tx, priced);
      return tx.shopOrder.create({
        data: {
          reference: await this.unusedReference(tx),
          accessToken: sha256(token),
          email: buyer.email,
          firstName: buyer.firstName,
          lastName: buyer.lastName,
          phone: buyer.phone,
          shippingAddress: buyer.address as unknown as Prisma.InputJsonValue,
          provider: adapter.key,
          subtotalCents: priced.subtotalCents,
          shippingCents: priced.shippingCents,
          totalCents: priced.totalCents,
          currency: priced.currency,
          expiresAt: holdUntil(adapter, settings),
          items: { create: priced.lines.map((l) => ({ productId: l.productId, name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity, vatRate: new Prisma.Decimal(l.vatRate) })) },
        },
        include: ORDER_DETAILS,
      });
    });

    try {
      const redirectUrl = await this.startPayment(order, adapter);
      await this.afterOfflineChoice(order.id, adapter);
      return { reference: order.reference, token, redirectUrl, kind: adapter.kind };
    } catch (err) {
      // Nothing was paid: give the stock back so the buyer (or anyone) can try again straight away.
      await this.cancelUnpaid(order.id, 'The payment page could not be opened').catch((e) => this.logger.error(`Releasing shop order ${order.reference} failed: ${e?.message}`));
      throw err;
    }
  }

  /** Another try at paying an order that is still waiting, e.g. after a declined card, possibly with another provider. */
  async retryPayment(reference: string, token: string | undefined, provider: string | undefined) {
    let order = await this.orderForBuyer(reference, token);
    await this.refreshLatest(order);
    order = await this.loadOrder(order.id);
    if (order.status !== ShopOrderStatus.AWAITING_PAYMENT) throw appError(ErrorCode.SHOP_ORDER_CLOSED);
    const adapter = this.adapterFor(provider ?? order.provider);
    const settings = shopSettings(this.config);
    checkCodLimit(adapter, order.totalCents, settings);
    checkCodPhone(adapter, order.phone);
    // The stock is still held (the order hasn't lapsed), so the new try gets a full hold of its own.
    await this.prisma.shopOrder.update({ where: { id: order.id }, data: { provider: adapter.key, expiresAt: holdUntil(adapter, settings) } });
    const redirectUrl = await this.startPayment(order, adapter);
    await this.afterOfflineChoice(order.id, adapter);
    return { reference: order.reference, redirectUrl, kind: adapter.kind };
  }

  /** The order page: what was bought and where the order stands. Asks the provider first if a payment is still open. */
  async orderStatus(reference: string, token: string | undefined) {
    const order = await this.orderForBuyer(reference, token);
    if (order.status === ShopOrderStatus.AWAITING_PAYMENT) await this.refreshLatest(order);
    return buyerView(await this.loadOrder(order.id), this.checkoutOptions().paymentMethods, this.transferDetails());
  }

  // ── Payments ─────────────────────────────────────────────────────────────────────────────────────────────

  /** A provider says something happened to one of its orders. Looked up and checked with the provider. */
  async onProviderNotice(provider: ShopPaymentProvider, providerOrderId: string | undefined) {
    if (!providerOrderId) return { handled: false };
    const payment = await this.prisma.shopPayment.findUnique({ where: { provider_providerOrderId: { provider, providerOrderId } } });
    if (!payment) return { handled: false };
    await this.refresh(payment);
    return { handled: true };
  }

  /** Asks the provider where a try stands and records it. Safe to call any number of times. */
  async refresh(payment: ShopPayment): Promise<PaymentState | null> {
    if (payment.status !== ShopPaymentStatus.PENDING || !payment.providerOrderId) return null;
    const adapter = this.adapters.find((a) => a.key === payment.provider);
    if (!adapter) return null;
    const state = await adapter.status(payment.providerOrderId);
    await this.apply(payment, state);
    return state;
  }

  /** Records what the provider said about a try. Exported for the local test payment page. */
  async apply(payment: ShopPayment, state: PaymentState) {
    if (state.status === 'PENDING') {
      if (state.failureMessage && state.failureMessage !== payment.failureMessage) {
        await this.prisma.shopPayment.update({ where: { id: payment.id }, data: { failureCode: state.failureCode, failureMessage: state.failureMessage } });
      }
      return;
    }

    if (state.status === 'FAILED' || state.status === 'CANCELLED') {
      await this.prisma.shopPayment.updateMany({
        where: { id: payment.id, status: ShopPaymentStatus.PENDING },
        data: { status: state.status === 'FAILED' ? ShopPaymentStatus.FAILED : ShopPaymentStatus.CANCELLED, failureCode: state.failureCode ?? null, failureMessage: state.failureMessage ?? null, completedAt: new Date() },
      });
      return;
    }

    // Paid, but the purchase itself can't be read yet (the provider's transaction list can lag). Nothing failed: the
    // try stays open and is read again on the next notification or sweep, and staff see why it's waiting.
    if (!state.transactionId) {
      this.logger.warn(`Shop payment ${payment.id} (${payment.provider} ${payment.providerOrderId}) reported paid without a transaction id; asking again later`);
      await this.prisma.shopPayment.updateMany({
        where: { id: payment.id, status: ShopPaymentStatus.PENDING },
        data: { failureCode: 'PAID_UNCONFIRMED', failureMessage: 'The provider reports this paid, but its transaction isn’t readable yet. Checked again automatically.' },
      });
      return;
    }
    const { reference } = await this.prisma.shopOrder.findUniqueOrThrow({ where: { id: payment.orderId }, select: { reference: true } });
    const problem = mismatch({ amountCents: payment.amountCents, currency: payment.currency, merchantReference: `${reference}-${payment.attempt}` }, state);
    if (problem) {
      // Money may have moved, but not what we asked for: never treat it as paid. Staff must look at it.
      this.logger.error(`Shop payment ${payment.id} (${payment.provider} ${payment.providerOrderId}) reported paid but ${problem}; not marked paid`);
      await this.prisma.shopPayment.updateMany({
        where: { id: payment.id, status: ShopPaymentStatus.PENDING },
        data: { status: ShopPaymentStatus.FAILED, failureCode: 'MISMATCH', failureMessage: `Provider reported: ${problem}. Check it in the provider’s portal.`, providerTransactionId: state.transactionId ?? null, completedAt: new Date() },
      });
      return;
    }

    const paidAt = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      // Only one caller gets to record the payment (the webhook, the order page and the sweep can all arrive at once).
      const claimed = await tx.shopPayment.updateMany({
        where: { id: payment.id, status: ShopPaymentStatus.PENDING },
        data: { status: ShopPaymentStatus.SUCCEEDED, providerTransactionId: state.transactionId ?? null, cardSummary: state.cardSummary ?? null, failureCode: null, failureMessage: null, completedAt: paidAt },
      });
      if (!claimed.count) return 'ALREADY_RECORDED' as const;

      const order = await tx.shopOrder.findUniqueOrThrow({ where: { id: payment.orderId }, include: { items: true } });
      if (order.status === ShopOrderStatus.AWAITING_PAYMENT || order.status === ShopOrderStatus.CANCELLED) {
        if (order.status === ShopOrderStatus.CANCELLED) {
          // Paid after its hold lapsed: the stock was given back, so take it again. It may go below zero; staff see it.
          this.logger.warn(`Shop order ${order.reference} was paid after it lapsed; taking its stock again`);
          for (const item of order.items) await tx.shopProduct.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
        }
        await tx.shopOrder.update({ where: { id: order.id }, data: { status: ShopOrderStatus.PAID, paidAt, provider: payment.provider, cancelledAt: null, cancelReason: null } });
        await tx.fiscalReceipt.create({ data: { orderId: order.id, kind: 'SALE', amountCents: payment.amountCents, currency: payment.currency } });
        return 'PAID' as const;
      }
      if (!order.paidAt && order.status !== ShopOrderStatus.PAID && order.status !== ShopOrderStatus.REFUNDED) {
        // Paid on delivery: the money arrives after the order was confirmed (and maybe sent). It keeps its place in the journey.
        await tx.shopOrder.update({ where: { id: order.id }, data: { paidAt, ...(order.status === ShopOrderStatus.CONFIRMED && { status: ShopOrderStatus.PAID }) } });
        await tx.fiscalReceipt.create({ data: { orderId: order.id, kind: 'SALE', amountCents: payment.amountCents, currency: payment.currency } });
        return 'PAID_ON_DELIVERY' as const;
      }
      // A second try went through for an order that was already paid (two tabs, two providers). Keep the record; staff refund it.
      this.logger.error(`Shop order ${order.reference} was paid twice (payment ${payment.id}); refund one of them`);
      return 'PAID_TWICE' as const;
    });

    if (outcome === 'PAID') {
      const order = await this.loadOrder(payment.orderId);
      await this.email
        .sendShopOrderEmail(order.email, order.firstName, { kind: 'PAID', ...emailOrder(order, this.orderUrl(order.reference)) })
        .catch((err: any) => this.logger.error(`Shop order email for ${order.reference} failed: ${err?.message}`));
    }
  }

  /** The local test payment page's buttons. Refused in production. */
  async completeTestPayment(paymentId: string, outcome: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') throw appError(ErrorCode.FORBIDDEN, 'Test payments are switched off.');
    const payment = await this.prisma.shopPayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.provider !== ShopPaymentProvider.DEV) throw new NotFoundException('No such test payment');
    const state: PaymentState =
      outcome === 'success'
        ? { status: 'SUCCEEDED', amountCents: payment.amountCents, currency: payment.currency, transactionId: `dev-tx-${payment.id}`, cardSummary: 'TEST ···· 4242' }
        : outcome === 'fail'
          ? { status: 'FAILED', failureCode: '2004', failureMessage: 'Your bank declined the payment because there isn’t enough money on the card. Try another card.' }
          : { status: 'CANCELLED' };
    await this.apply(payment, state);
    return { ok: true };
  }

  /** Every few minutes: asks about payments left open, then releases orders whose hold has lapsed unpaid. */
  async sweep() {
    const now = new Date();
    const lapsed = await this.prisma.shopOrder.findMany({
      where: { status: ShopOrderStatus.AWAITING_PAYMENT, expiresAt: { lt: now } },
      include: ORDER_DETAILS,
      take: 100,
    });
    let paid = 0;
    let released = 0;
    for (const order of lapsed) {
      try {
        // A buyer may have paid with the notification lost: ask before letting go of the stock.
        let reportedPaid = false;
        for (const payment of order.payments) {
          if (payment.status !== ShopPaymentStatus.PENDING) continue;
          if ((await this.refresh(payment))?.status === 'SUCCEEDED') reportedPaid = true;
        }
        const current = await this.loadOrder(order.id);
        if (current.status === ShopOrderStatus.PAID) paid++;
        // The provider says paid but it couldn't be recorded yet: keep the stock and ask again next time.
        else if (reportedPaid) this.logger.warn(`Shop order ${order.reference} is reported paid but not confirmed yet; keeping it`);
        else if (await this.cancelUnpaid(order.id, 'Not paid in time')) released++;
      } catch (err: any) {
        // The provider couldn't be reached: keep holding the stock and ask again next time.
        this.logger.warn(`Shop order ${order.reference}: could not check its payment (${err?.message}); asking again later`);
      }
    }
    return { checked: lapsed.length, paid, released };
  }

  // ── Staff ────────────────────────────────────────────────────────────────────────────────────────────────

  async listOrders(filter: { status?: ShopOrderStatus; search?: string; take?: number }) {
    const search = filter.search?.trim();
    return this.prisma.shopOrder.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
        ...(search && {
          OR: [
            { reference: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: { ...ORDER_DETAILS, refunds: { orderBy: { createdAt: 'asc' } }, fiscalReceipts: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(filter.take ?? 50, 1), 200),
    });
  }

  async orderForStaff(id: string) {
    const order = await this.prisma.shopOrder.findUnique({ where: { id }, include: { ...ORDER_DETAILS, refunds: { orderBy: { createdAt: 'asc' } }, fiscalReceipts: { orderBy: { createdAt: 'asc' } } } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async allProducts() {
    return this.prisma.shopProduct.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async saveProduct(
    input: { id?: string; slug: string; name: string; brand?: string | null; description?: string | null; imageUrl?: string | null; category?: string | null; priceCents: number; vatRate: number; stock: number; maxPerOrder: number; active: boolean; sortOrder?: number | null },
    staffId: string,
  ) {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { slug: 'Use lowercase letters, numbers and hyphens, e.g. whey-protein-1kg' } });
    if (!input.name.trim()) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { name: 'Enter the product’s name' } });
    if (!Number.isInteger(input.priceCents) || input.priceCents < 1) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { priceCents: 'Enter a price above zero' } });
    if (!Number.isInteger(input.stock) || input.stock < 0) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { stock: 'Enter the number of units, 0 or more' } });
    if (!Number.isInteger(input.maxPerOrder) || input.maxPerOrder < 1) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { maxPerOrder: 'Allow at least 1 per order' } });
    if (!(input.vatRate >= 0 && input.vatRate <= 100)) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { vatRate: 'Enter a VAT rate between 0 and 100' } });

    const data = {
      slug,
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      description: input.description?.trim() ?? '',
      imageUrl: input.imageUrl?.trim() || null,
      category: input.category?.trim() || null,
      priceCents: input.priceCents,
      vatRate: new Prisma.Decimal(input.vatRate),
      stock: input.stock,
      maxPerOrder: input.maxPerOrder,
      active: input.active,
      sortOrder: input.sortOrder ?? 0,
    };
    try {
      const saved = input.id ? await this.prisma.shopProduct.update({ where: { id: input.id }, data }) : await this.prisma.shopProduct.create({ data });
      await this.audit.log({ actorId: staffId, actorRole: UserRole.CLINICIAN, action: input.id ? 'SHOP_PRODUCT_UPDATED' : 'SHOP_PRODUCT_CREATED', resourceType: 'ShopProduct', resourceId: saved.id, metadata: { slug, priceCents: input.priceCents, stock: input.stock, active: input.active } });
      return saved;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { slug: 'Another product already uses this address' } });
      }
      throw err;
    }
  }

  /**
   * Staff record money that arrived away from the website: the courier handed over a pay-on-delivery payment, or a
   * bank transfer came in. Recorded like a card payment (fiscal receipt owed, order paid).
   */
  async markPaymentReceived(orderId: string, staffId: string) {
    const order = await this.loadOrder(orderId);
    const offline = new Set(this.adapters.filter((a) => a.kind === 'OFFLINE').map((a) => a.key));
    const payment = [...order.payments].reverse().find((p) => p.status === ShopPaymentStatus.PENDING && offline.has(p.provider));
    if (!payment || order.paidAt) throw warning('This order has no payment on delivery or bank transfer waiting to be recorded.', ErrorCode.CONFLICT);
    await this.apply(payment, { status: 'SUCCEEDED', amountCents: payment.amountCents, currency: payment.currency, transactionId: `manual-${staffId}-${Date.now()}` });
    await this.audit.log({ actorId: staffId, actorRole: UserRole.CLINICIAN, action: 'SHOP_PAYMENT_RECEIVED', resourceType: 'ShopOrder', resourceId: orderId, metadata: { provider: payment.provider, amountCents: payment.amountCents } });
    return this.loadOrder(orderId);
  }

  async markDispatched(orderId: string, details: { carrier?: string | null; trackingNumber?: string | null }, staffId: string) {
    const updated = await this.prisma.shopOrder.updateMany({
      // Paid, or confirmed to be paid on delivery.
      where: { id: orderId, status: { in: [ShopOrderStatus.PAID, ShopOrderStatus.CONFIRMED] } },
      data: { status: ShopOrderStatus.DISPATCHED, dispatchedAt: new Date(), carrier: details.carrier?.trim() || null, trackingNumber: details.trackingNumber?.trim() || null },
    });
    if (!updated.count) throw warning('Only a paid order, or one to be paid on delivery, that hasn’t shipped yet can be marked as sent.', ErrorCode.CONFLICT);
    await this.audit.log({ actorId: staffId, actorRole: UserRole.CLINICIAN, action: 'SHOP_ORDER_DISPATCHED', resourceType: 'ShopOrder', resourceId: orderId });
    const order = await this.loadOrder(orderId);
    await this.email
      .sendShopOrderEmail(order.email, order.firstName, { kind: 'DISPATCHED', ...emailOrder(order, this.orderUrl(order.reference)), carrier: order.carrier, trackingNumber: order.trackingNumber })
      .catch((err: any) => this.logger.error(`Shop dispatch email for ${order.reference} failed: ${err?.message}`));
    return order;
  }

  async markDelivered(orderId: string, staffId: string) {
    const updated = await this.prisma.shopOrder.updateMany({ where: { id: orderId, status: ShopOrderStatus.DISPATCHED }, data: { status: ShopOrderStatus.DELIVERED, deliveredAt: new Date() } });
    if (!updated.count) throw warning('Only an order that has been sent can be marked as delivered.', ErrorCode.CONFLICT);
    await this.audit.log({ actorId: staffId, actorRole: UserRole.CLINICIAN, action: 'SHOP_ORDER_DELIVERED', resourceType: 'ShopOrder', resourceId: orderId });
    return this.loadOrder(orderId);
  }

  /** Stops an order nobody has paid for (including a pay-on-delivery parcel that was refused) and gives its stock back. */
  async cancelByStaff(orderId: string, reason: string, staffId: string) {
    const order = await this.loadOrder(orderId);
    if (order.paidAt || !UNPAID_OPEN.includes(order.status)) throw warning('A paid order is stopped by refunding it.', ErrorCode.CONFLICT);
    for (const payment of order.payments) if (payment.status === ShopPaymentStatus.PENDING) await this.refresh(payment).catch(() => undefined);
    if (!(await this.cancelUnpaid(orderId, reason.trim() || 'Cancelled by staff', UNPAID_OPEN))) throw warning('This order was paid a moment ago. Refresh to see it.', ErrorCode.CONFLICT);
    // Nobody will pay this order by hand any more.
    const offline = this.adapters.filter((a) => a.kind === 'OFFLINE').map((a) => a.key);
    await this.prisma.shopPayment.updateMany({ where: { orderId, status: ShopPaymentStatus.PENDING, provider: { in: offline } }, data: { status: ShopPaymentStatus.CANCELLED, completedAt: new Date() } });
    await this.audit.log({ actorId: staffId, actorRole: UserRole.CLINICIAN, action: 'SHOP_ORDER_CANCELLED', resourceType: 'ShopOrder', resourceId: orderId, metadata: { reason } });
    return this.loadOrder(orderId);
  }

  /**
   * Gives money back through the provider that took it, from one payment at a time: `paymentId`, or else the first
   * payment with money left to give back (an order paid twice has two). Without an amount, everything left on that
   * payment. `restock` puts the items back on sale (only once all money taken is refunded, for an order that never left).
   */
  async refund(orderId: string, input: { paymentId?: string | null; amountCents?: number | null; reason?: string | null; restock?: boolean | null }, staffId: string) {
    const order = await this.prisma.shopOrder.findUnique({ where: { id: orderId }, include: { ...ORDER_DETAILS, refunds: true } });
    if (!order) throw new NotFoundException('Order not found');
    const refundedFrom = (paymentId: string) => order.refunds.filter((r) => r.paymentId === paymentId).reduce((sum, r) => sum + r.amountCents, 0);
    const succeeded = order.payments.filter((p) => p.status === ShopPaymentStatus.SUCCEEDED && p.providerTransactionId && p.providerOrderId);
    const payment = input.paymentId
      ? succeeded.find((p) => p.id === input.paymentId)
      : succeeded.find((p) => p.amountCents - refundedFrom(p.id) > 0);
    if (!payment) throw warning(input.paymentId ? 'That payment can’t be refunded.' : 'This order has no completed payment left to refund.', ErrorCode.CONFLICT);

    const refundable = payment.amountCents - refundedFrom(payment.id);
    const amount = input.amountCents ?? refundable;
    if (!Number.isInteger(amount) || amount < 1) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { amountCents: 'Enter an amount above zero' } });
    if (amount > refundable) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { amountCents: `At most ${(refundable / 100).toFixed(2)} can still be refunded` } });

    const adapter = this.adapters.find((a) => a.key === payment.provider);
    if (!adapter) throw appError(ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
    let providerRefundId: string;
    try {
      providerRefundId = await adapter.refund({ providerOrderId: payment.providerOrderId!, providerTransactionId: payment.providerTransactionId!, currency: payment.currency }, amount);
    } catch (err: any) {
      this.logger.error(`Refund of shop order ${order.reference} failed: ${err?.message}`);
      throw appError(ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE, 'The refund didn’t go through. Nothing was given back. Try again, or refund it in the provider’s portal.');
    }

    // The money has moved: from here, record it whatever else fails. Fully refunded only once everything taken (all
    // payments, if it was paid twice) has gone back; refunding one duplicate leaves the order paid once.
    const takenCents = succeeded.reduce((sum, p) => sum + p.amountCents, 0);
    const full = order.refundedCents + amount >= takenCents;
    const restock = Boolean(input.restock) && full && order.status === ShopOrderStatus.PAID;
    await this.prisma.$transaction(async (tx) => {
      const refund = await tx.shopRefund.create({ data: { orderId, paymentId: payment.id, amountCents: amount, providerRefundId, reason: input.reason?.trim() || null, createdById: staffId } });
      await tx.fiscalReceipt.create({ data: { orderId, kind: 'REFUND', amountCents: amount, currency: payment.currency, refundId: refund.id } });
      await tx.shopOrder.update({ where: { id: orderId }, data: { refundedCents: { increment: amount }, ...(full && { status: ShopOrderStatus.REFUNDED }) } });
      if (restock) for (const item of order.items) await tx.shopProduct.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      await this.audit.log({ actorId: staffId, actorRole: UserRole.CLINICIAN, action: 'SHOP_ORDER_REFUNDED', resourceType: 'ShopOrder', resourceId: orderId, metadata: { amountCents: amount, provider: payment.provider, providerRefundId, restock } }, tx);
    });
    const updated = await this.loadOrder(orderId);
    await this.email
      .sendShopOrderEmail(updated.email, updated.firstName, { kind: 'REFUNDED', ...emailOrder(updated, this.orderUrl(updated.reference)), refundedCents: amount, offline: adapter.kind === 'OFFLINE' })
      .catch((err: any) => this.logger.error(`Shop refund email for ${updated.reference} failed: ${err?.message}`));
    return updated;
  }

  async pendingFiscalReceipts() {
    return this.prisma.fiscalReceipt.findMany({ where: { status: 'PENDING' }, include: { order: { select: { reference: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' }, take: 200 });
  }

  /** Staff record the number of the fiscal receipt they issued from the fiscal device or software. */
  async markFiscalReceiptIssued(id: string, receiptNumber: string, staffId: string) {
    const number = receiptNumber.trim();
    if (!number) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { receiptNumber: 'Enter the fiscal receipt number' } });
    const updated = await this.prisma.fiscalReceipt.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'ISSUED', receiptNumber: number, issuedAt: new Date(), issuedById: staffId } });
    if (!updated.count) throw warning('This receipt was already marked as issued.', ErrorCode.CONFLICT);
    await this.audit.log({ actorId: staffId, actorRole: UserRole.CLINICIAN, action: 'FISCAL_RECEIPT_ISSUED', resourceType: 'FiscalReceipt', resourceId: id, metadata: { receiptNumber: number } });
    return this.prisma.fiscalReceipt.findUniqueOrThrow({ where: { id }, include: { order: { select: { reference: true, firstName: true, lastName: true } } } });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────

  private async startPayment(order: OrderWithDetails, adapter: ShopPaymentAdapter): Promise<string> {
    const attempt = (order.payments[order.payments.length - 1]?.attempt ?? 0) + 1;
    const payment = await this.prisma.shopPayment.create({
      data: { orderId: order.id, provider: adapter.key, attempt, amountCents: order.totalCents, currency: order.currency },
    });
    const site = this.siteUrl();
    const api = (this.config.get<string>('API_PUBLIC_URL')?.trim() || 'http://localhost:4000').replace(/\/$/, '');
    const back = (result: string) => `${site}/shop/order/${encodeURIComponent(order.reference)}?result=${result}`;
    try {
      const started = await adapter.start({
        merchantReference: `${order.reference}-${attempt}`,
        paymentId: payment.id,
        amountCents: order.totalCents,
        currency: order.currency,
        description: `Omopharmacy order ${order.reference}`,
        items: [
          ...order.items.map((i) => ({ name: i.name, unitPriceCents: i.unitPriceCents, quantity: i.quantity })),
          ...(order.shippingCents > 0 ? [{ name: 'Delivery', unitPriceCents: order.shippingCents, quantity: 1 }] : []),
        ],
        buyer: { email: order.email, firstName: order.firstName, lastName: order.lastName, phone: order.phone },
        address: order.shippingAddress as unknown as ShopAddress,
        urls: { success: back('success'), fail: back('failed'), cancel: back('cancelled'), notify: `${api}/api/shop/payments/${adapter.key.toLowerCase()}/notify` },
      });
      await this.prisma.shopPayment.update({ where: { id: payment.id }, data: { providerOrderId: started.providerOrderId, redirectUrl: started.redirectUrl } });
      return started.redirectUrl;
    } catch (err: any) {
      const message = err instanceof PaymentProviderError ? err.message : err?.message;
      this.logger.error(`Opening ${adapter.key} for shop order ${order.reference} failed: ${message}`);
      await this.prisma.shopPayment.update({ where: { id: payment.id }, data: { status: ShopPaymentStatus.FAILED, failureCode: 'START_FAILED', failureMessage: 'The payment page could not be opened.', completedAt: new Date() } });
      throw appError(ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
    }
  }

  /** Releases an unpaid order's stock. False when it was no longer waiting (paid or already released meanwhile). */
  private async cancelUnpaid(orderId: string, reason: string, statuses: ShopOrderStatus[] = [ShopOrderStatus.AWAITING_PAYMENT]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.shopOrder.updateMany({
        where: { id: orderId, status: { in: statuses }, paidAt: null },
        data: { status: ShopOrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
      });
      if (!cancelled.count) return false;
      const items = await tx.shopOrderItem.findMany({ where: { orderId } });
      for (const item of items) await tx.shopProduct.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      // Open payment tries stay open: the buyer may still finish on the bank's page, and that payment must then be
      // recorded (the order comes back as paid, see apply) rather than lost.
      return true;
    });
  }

  /** Pay on delivery: the order is accepted now. Bank transfer: the buyer gets the details by email too. */
  private async afterOfflineChoice(orderId: string, adapter: ShopPaymentAdapter) {
    if (adapter.kind !== 'OFFLINE') return;
    if (adapter.key === ShopPaymentProvider.COD) {
      await this.prisma.shopOrder.updateMany({ where: { id: orderId, status: ShopOrderStatus.AWAITING_PAYMENT }, data: { status: ShopOrderStatus.CONFIRMED } });
    }
    const order = await this.loadOrder(orderId);
    const transfer = this.transferDetails();
    await this.email
      .sendShopOrderEmail(order.email, order.firstName, {
        kind: adapter.key === ShopPaymentProvider.COD ? 'CONFIRMED_COD' : 'TRANSFER_DETAILS',
        ...emailOrder(order, this.orderUrl(order.reference)),
        ...(adapter.key === ShopPaymentProvider.BANK_TRANSFER && transfer && { transfer: { ...transfer, payBy: order.expiresAt } }),
      })
      .catch((err: any) => this.logger.error(`Shop order email for ${order.reference} failed: ${err?.message}`));
  }

  private transferDetails() {
    return (this.adapters.find((a) => a.key === ShopPaymentProvider.BANK_TRANSFER) as BankTransferAdapter | undefined)?.details() ?? null;
  }

  private async refreshLatest(order: OrderWithDetails) {
    const pending = order.payments.filter((p) => p.status === ShopPaymentStatus.PENDING);
    for (const payment of pending) {
      try {
        await this.refresh(payment);
      } catch (err: any) {
        // The buyer still sees the order; the sweep and the provider's notification will catch up.
        this.logger.warn(`Checking shop payment ${payment.id} failed: ${err?.message}`);
      }
    }
  }

  private async orderForBuyer(reference: string, token: string | undefined): Promise<OrderWithDetails> {
    const order = await this.prisma.shopOrder.findUnique({ where: { reference: (reference ?? '').trim().toUpperCase() }, include: ORDER_DETAILS });
    // The same answer whether the order doesn't exist or the link is wrong, so references can't be guessed.
    const given = Buffer.from(sha256(token ?? ''));
    if (!order || !token || !crypto.timingSafeEqual(given, Buffer.from(order.accessToken))) {
      throw new NotFoundException('We couldn’t find this order. Use the link in your order email.');
    }
    return order;
  }

  private loadOrder(id: string): Promise<OrderWithDetails> {
    return this.prisma.shopOrder.findUniqueOrThrow({ where: { id }, include: ORDER_DETAILS });
  }

  private adapterFor(key: string | undefined): ShopPaymentAdapter {
    const offered = this.checkoutOptions().paymentMethods.map((m) => m.key as string);
    const adapter = this.adapters.find((a) => a.key === key);
    if (!adapter || !offered.includes(adapter.key)) throw appError(ErrorCode.VALIDATION_FAILED, 'Choose how you’d like to pay.', { fields: { provider: 'Choose how you’d like to pay' } });
    return adapter;
  }

  private checkBuyer(input: CreateShopOrderInput, countries: string[]) {
    const fields: Record<string, string> = {};
    const email = (input.email ?? '').trim().toLowerCase();
    const firstName = (input.firstName ?? '').trim();
    const lastName = (input.lastName ?? '').trim();
    const phone = (input.phone ?? '').trim() || null;
    const address = {
      line1: (input.address?.line1 ?? '').trim(),
      city: (input.address?.city ?? '').trim(),
      postalCode: (input.address?.postalCode ?? '').trim(),
      country: (input.address?.country ?? '').trim().toUpperCase(),
    };
    if (!EMAIL.test(email) || email.length > 200) fields.email = 'Enter a valid email address';
    if (!firstName || firstName.length > 60) fields.firstName = 'Enter your first name';
    if (!lastName || lastName.length > 60) fields.lastName = 'Enter your last name';
    if (phone && !/^\+?[\d\s()-]{6,20}$/.test(phone)) fields.phone = 'Enter a valid phone number';
    if (!address.line1 || address.line1.length > 120) fields.line1 = 'Enter your street address';
    if (!address.city || address.city.length > 60) fields.city = 'Enter your city';
    if (address.postalCode.length > 16) fields.postalCode = 'Enter a valid postal code';
    if (!countries.includes(address.country)) fields.country = 'We don’t deliver there yet';
    if (Object.keys(fields).length) throw appError(ErrorCode.VALIDATION_FAILED, undefined, { fields });
    return { email, firstName, lastName, phone, address };
  }

  private async unusedReference(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const reference = newReference();
      if (!(await tx.shopOrder.findUnique({ where: { reference }, select: { id: true } }))) return reference;
    }
    throw new Error('Could not find an unused shop order reference');
  }

  private siteUrl() {
    return (this.config.get<string>('WEBFLOW_SITE_URL') ?? 'http://localhost:3001').replace(/\/$/, '');
  }

  // The token isn't stored, so links in emails go to the page that asks for it, which the buyer's browser remembers.
  private orderUrl(reference: string) {
    return `${this.siteUrl()}/shop/order/${encodeURIComponent(reference)}`;
  }
}

/** Orders not paid yet that staff may still stop: waiting for a payment, or confirmed / sent to be paid on delivery. */
const UNPAID_OPEN: ShopOrderStatus[] = [ShopOrderStatus.AWAITING_PAYMENT, ShopOrderStatus.CONFIRMED, ShopOrderStatus.DISPATCHED];

/** How long the stock is held unpaid: minutes for a card, days for a bank transfer. Pay on delivery doesn't lapse. */
function holdUntil(adapter: ShopPaymentAdapter, settings: ShopSettings): Date {
  const ms = adapter.key === ShopPaymentProvider.BANK_TRANSFER ? settings.transferHoldDays * 86_400_000 : HOLD_MINUTES * 60_000;
  return new Date(Date.now() + ms);
}

function checkCodLimit(adapter: ShopPaymentAdapter, totalCents: number, settings: ShopSettings) {
  if (adapter.key === ShopPaymentProvider.COD && settings.codMaxCents !== null && totalCents > settings.codMaxCents) {
    const max = new Intl.NumberFormat('en-GB', { style: 'currency', currency: settings.currency.toUpperCase() }).format(settings.codMaxCents / 100);
    throw appError(ErrorCode.VALIDATION_FAILED, `Pay on delivery is available for orders up to ${max}. Please pay by card or bank transfer.`, { fields: { provider: `Up to ${max}` } });
  }
}

/** The courier calls before bringing a parcel that is paid on delivery. */
function checkCodPhone(adapter: ShopPaymentAdapter, phone: string | null) {
  if (adapter.key === ShopPaymentProvider.COD && !phone) {
    throw appError(ErrorCode.VALIDATION_FAILED, 'Add a phone number so the courier can call before delivering.', { fields: { phone: 'Needed for pay on delivery' } });
  }
}

/** Takes each line's units off the shelf, or fails the whole order if any line no longer has enough. */
async function holdStock(tx: Prisma.TransactionClient, priced: Quote) {
  for (const line of priced.lines) {
    const taken = await tx.shopProduct.updateMany({
      where: { id: line.productId, active: true, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    if (!taken.count) throw appError(ErrorCode.SHOP_OUT_OF_STOCK, `${line.name} is no longer in stock in that quantity. Please update your basket.`);
  }
}

function quoteError(problem: Exclude<ReturnType<typeof quote>, Quote>) {
  switch (problem.kind) {
    case 'EMPTY':
      return new BadRequestException('Your basket is empty.');
    case 'UNAVAILABLE':
      return appError(ErrorCode.SHOP_OUT_OF_STOCK, problem.name ? `${problem.name} is no longer available. Please remove it from your basket.` : undefined);
    case 'TOO_MANY':
      return appError(ErrorCode.SHOP_OUT_OF_STOCK, `You can buy at most ${problem.max} of ${problem.name}. Please update your basket.`);
    case 'MIXED_CURRENCY':
      return new BadRequestException('These products can’t be bought together.');
  }
}

/** Why a reported payment doesn't match what we asked for, or null when it does. */
export function mismatch(expected: { amountCents: number; currency: string; merchantReference: string }, state: PaymentState): string | null {
  if (state.amountCents === undefined || state.amountCents !== expected.amountCents) return `amount ${state.amountCents ?? 'unknown'} instead of ${expected.amountCents}`;
  if (!state.currency || state.currency.toLowerCase() !== expected.currency.toLowerCase()) return `currency ${state.currency ?? 'unknown'} instead of ${expected.currency}`;
  // Providers that keep our reference must give back the one for this try.
  if (state.merchantReference !== undefined && state.merchantReference !== expected.merchantReference) return `reference ${state.merchantReference} instead of ${expected.merchantReference}`;
  return null;
}

function publicProduct(p: { id: string; slug: string; name: string; brand: string | null; description: string; imageUrl: string | null; category: string | null; priceCents: number; currency: string; stock: number; maxPerOrder: number }) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    description: p.description,
    imageUrl: p.imageUrl,
    category: p.category,
    priceCents: p.priceCents,
    currency: p.currency,
    inStock: p.stock > 0,
    // How many one order may take now: never more than are left.
    maxQuantity: Math.max(0, Math.min(p.maxPerOrder, p.stock)),
  };
}

function buyerView(
  order: OrderWithDetails,
  paymentMethods: Array<{ key: string; kind: string; label: string; description: string }>,
  transfer: { iban: string; accountName: string; bankName: string | null } | null,
) {
  const latest = order.payments[order.payments.length - 1];
  return {
    reference: order.reference,
    status: order.status,
    provider: order.provider,
    email: order.email,
    firstName: order.firstName,
    items: order.items.map((i) => ({ name: i.name, unitPriceCents: i.unitPriceCents, quantity: i.quantity })),
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    refundedCents: order.refundedCents,
    currency: order.currency,
    shippingAddress: order.shippingAddress,
    paidAt: order.paidAt,
    dispatchedAt: order.dispatchedAt,
    deliveredAt: order.deliveredAt,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    expiresAt: order.expiresAt,
    // What happened to the last try, so the page can say why a payment didn't go through.
    payment: latest ? { provider: latest.provider, status: latest.status, failureMessage: latest.failureMessage, cardSummary: latest.cardSummary } : null,
    paymentMethods: order.status === ShopOrderStatus.AWAITING_PAYMENT ? paymentMethods : [],
    // What to pay into, while a bank transfer is awaited. The order reference goes in the transfer's description.
    bankTransfer:
      order.provider === ShopPaymentProvider.BANK_TRANSFER && order.status === ShopOrderStatus.AWAITING_PAYMENT && transfer
        ? { ...transfer, reference: order.reference, amountCents: order.totalCents, payBy: order.expiresAt }
        : null,
  };
}

function emailOrder(order: OrderWithDetails, orderUrl: string) {
  return {
    reference: order.reference,
    items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, totalCents: i.unitPriceCents * i.quantity })),
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    currency: order.currency,
    orderUrl,
  };
}
