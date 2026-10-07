/**
 * Links each dose in the catalog to its monthly price in Stripe, matching Stripe products to doses
 * by name ("Mounjaro 7.5mg" → Mounjaro 7.5 mg; see src/stripe/match-stripe-prices.ts).
 *
 *   cd backend
 *   pnpm sync-dose-prices           # show what would be linked; changes nothing
 *   pnpm sync-dose-prices --apply   # save it
 *
 * Reads STRIPE_SECRET_KEY and DATABASE_URL from the environment, or else from backend/.env.
 * Only reads from Stripe.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { CatalogStrength, matchPrices, StripePriceInfo } from '../src/stripe/match-stripe-prices';

const money = (p: StripePriceInfo) => (p.amountCents == null ? '?' : `${(p.amountCents / 100).toFixed(2)} ${p.currency.toUpperCase()}`);

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if ((!process.env.STRIPE_SECRET_KEY || !process.env.DATABASE_URL) && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('Set STRIPE_SECRET_KEY in backend/.env first.');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const stripe = new Stripe(key, { apiVersion: '2023-10-16' as any });
  const prisma = new PrismaClient();

  try {
    console.log(`Stripe ${key.startsWith('sk_live') ? 'LIVE' : 'test/sandbox'} account\n`);

    const prices: StripePriceInfo[] = [];
    for await (const p of stripe.prices.list({ active: true, expand: ['data.product'], limit: 100 })) {
      const product = p.product as Stripe.Product | Stripe.DeletedProduct;
      if ('deleted' in product && product.deleted) continue;
      if (!(product as Stripe.Product).active) continue;
      prices.push({ id: p.id, productName: (product as Stripe.Product).name, recurring: !!p.recurring, amountCents: p.unit_amount, currency: p.currency });
    }

    const rows = await prisma.productStrength.findMany({ where: { active: true }, include: { product: true }, orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }] });
    const strengths: CatalogStrength[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      productName: r.product.brandName ?? r.product.name,
      productAliases: [r.product.brandName, r.product.name, r.product.slug].filter((a): a is string => !!a),
      stripePriceId: r.stripePriceId,
    }));

    const { matches, oneOff, unpriced, unmatchedProducts } = matchPrices(strengths, prices);

    console.log('Monthly (subscription) price per dose:');
    console.table(
      matches.map((m) => ({
        dose: `${m.strength.productName} ${m.strength.label}`,
        'Stripe product': m.price.productName,
        price: money(m.price),
        id: m.price.id,
        change: m.strength.stripePriceId === m.price.id ? 'already linked' : m.strength.stripePriceId ? `replaces ${m.strength.stripePriceId}` : 'new',
      })),
    );

    if (unpriced.length) {
      console.log('\nDoses with no monthly price in Stripe (billed at their plan tier price):');
      unpriced.forEach((s) => console.log(`  - ${s.productName} ${s.label}`));
    }
    if (oneOff.length) {
      console.log('\nOne-off prices found (kept for pay-as-you-go, not linked yet):');
      oneOff.forEach((m) => console.log(`  - ${m.strength.productName} ${m.strength.label}: ${money(m.price)} ${m.price.id}`));
    }
    if (unmatchedProducts.length) {
      console.log('\nStripe products that are not a catalog dose (e.g. plan tiers):');
      unmatchedProducts.forEach((n) => console.log(`  - ${n}`));
    }

    // A subscription can't move between currencies, so dose prices and plan tier prices must share one.
    const currencies = new Set(matches.map((m) => m.price.currency));
    const tierIds = Object.entries(process.env).filter(([k, v]) => k.startsWith('STRIPE_PRICE_') && v);
    const tierCurrencies = new Set(tierIds.map(([, id]) => prices.find((p) => p.id === id)?.currency).filter(Boolean));
    if (currencies.size > 1 || [...tierCurrencies].some((c) => !currencies.has(c as string))) {
      console.log(
        `\n⚠️  Currencies differ — dose prices: ${[...currencies].join(', ').toUpperCase() || 'none'}; plan tier prices (STRIPE_PRICE_* in .env): ${[...tierCurrencies].join(', ').toUpperCase() || 'none'}.` +
          '\n   Stripe can’t move a subscription between currencies: use one currency for all of them.',
      );
    }

    // A dose still linked to a price that is gone from Stripe (archived, or its product archived)
    // would be charged at a price checkout can't use: unlink it so it falls back to its plan price.
    // Prices linked by hand that are still active are left alone, matched by name or not.
    const activeMonthly = new Set(prices.filter((p) => p.recurring).map((p) => p.id));
    const relinked = new Set(matches.map((m) => m.strength.id));
    const stale = strengths.filter((s) => s.stripePriceId && !activeMonthly.has(s.stripePriceId) && !relinked.has(s.id));
    if (stale.length) {
      console.log('\nLinked to a price that is no longer active in Stripe (will be unlinked):');
      stale.forEach((s) => console.log(`  - ${s.productName} ${s.label}: ${s.stripePriceId}`));
    }

    const changes = matches.filter((m) => m.strength.stripePriceId !== m.price.id);
    if (!apply) {
      console.log(`\n${changes.length} dose(s) to link, ${stale.length} to unlink. Nothing saved — run with --apply to save.`);
      return;
    }
    for (const m of changes) await prisma.productStrength.update({ where: { id: m.strength.id }, data: { stripePriceId: m.price.id } });
    for (const s of stale) await prisma.productStrength.update({ where: { id: s.id }, data: { stripePriceId: null } });
    console.log(`\nLinked ${changes.length} dose(s), unlinked ${stale.length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
