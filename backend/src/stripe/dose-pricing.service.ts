import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultationKind, ProductCategory } from '../common/enums';
import { planFor, planPriceEnvVars } from './plan-pricing';

export type PricedItem = { category: ProductCategory | string; titrationStep: number | null; stripePriceId: string | null };

export interface DosePrice {
  product: string;
  dose: string;
  amountCents: number;
  currency: string;
}

const AMOUNT_TTL_MS = 10 * 60_000;

/**
 * Which Stripe price a prescription is billed at. Each GLP-1 dose has its own
 * price (ProductStrength.stripePriceId); anything without one falls back to its
 * plan tier's price (STRIPE_PRICE_<PLAN>, see plan-pricing.ts).
 */
@Injectable()
export class DosePricingService {
  private readonly logger = new Logger(DosePricingService.name);
  // Created only with a key: the Stripe SDK refuses an empty one.
  private stripe: Stripe | null;
  private amounts = new Map<string, { value: { amountCents: number; currency: string } | null; at: number }>();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = secretKey ? new Stripe(secretKey, { apiVersion: '2023-10-16' as any }) : null;
  }

  /** The price for a prescription's items: the GLP-1 dose's own price, else the plan tier's. */
  priceIdFor(kind: ConsultationKind | string, items: PricedItem[]): string | null {
    const glp1 = items.find((i) => i.category === ProductCategory.GLP1);
    if (glp1?.stripePriceId) return glp1.stripePriceId;
    for (const name of planPriceEnvVars(planFor(kind, items))) {
      const id = this.config.get<string>(name)?.trim();
      if (id) return id;
    }
    return null;
  }

  /** A price's monthly amount, cached briefly. Null when Stripe isn't configured or the price can't be read. */
  async amountOf(priceId: string): Promise<{ amountCents: number; currency: string } | null> {
    const cached = this.amounts.get(priceId);
    if (cached && Date.now() - cached.at < AMOUNT_TTL_MS) return cached.value;
    if (!this.stripe) return null;
    let value: { amountCents: number; currency: string } | null = null;
    try {
      const price = await this.stripe.prices.retrieve(priceId);
      if (price.unit_amount != null) value = { amountCents: price.unit_amount, currency: price.currency };
    } catch (err: any) {
      this.logger.error(`Could not read Stripe price ${priceId}: ${err.message}`);
    }
    this.amounts.set(priceId, { value, at: Date.now() });
    return value;
  }

  /** Every dose sold at its own price, with its amount — for the website's product picker. */
  async publicPrices(): Promise<DosePrice[]> {
    const strengths = await this.prisma.productStrength.findMany({
      where: { active: true, stripePriceId: { not: null }, product: { active: true } },
      include: { product: true },
      orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
    });
    const prices = await Promise.all(
      strengths.map(async (s) => {
        const amount = await this.amountOf(s.stripePriceId!);
        return amount ? { product: s.product.brandName ?? s.product.name, dose: s.label, ...amount } : null;
      }),
    );
    return prices.filter((p): p is DosePrice => p !== null);
  }
}
