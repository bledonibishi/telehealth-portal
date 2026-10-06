/**
 * Sets (or lists) the Stripe price for each dose. Each GLP-1 dose is sold at its own monthly price:
 * create the price in Stripe first, then attach its id here.
 *
 *   cd backend
 *   pnpm set-dose-price                                  # list every dose and its price id
 *   pnpm set-dose-price Mounjaro "7.5 mg" price_123      # set one
 *   pnpm set-dose-price Mounjaro "7.5 mg" none           # clear it (falls back to the plan tier price)
 *
 * Uses DATABASE_URL from the environment, or else from backend/.env.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
  const prisma = new PrismaClient();
  const [productName, doseLabel, priceId] = process.argv.slice(2);

  try {
    if (!productName) {
      const strengths = await prisma.productStrength.findMany({ include: { product: true }, orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }] });
      console.table(strengths.map((s) => ({ product: s.product.brandName ?? s.product.name, dose: s.label, stripePriceId: s.stripePriceId ?? '—' })));
      return;
    }
    if (!doseLabel || !priceId) {
      console.error('Usage: pnpm set-dose-price <product> "<dose>" <price_id | none>');
      process.exit(1);
    }
    if (priceId !== 'none' && !priceId.startsWith('price_')) {
      console.error(`"${priceId}" doesn't look like a Stripe price id (price_…).`);
      process.exit(1);
    }

    const name = productName.toLowerCase();
    const matches = await prisma.productStrength.findMany({
      where: { label: doseLabel },
      include: { product: true },
    });
    const strength = matches.find((s) => [s.product.brandName, s.product.name, s.product.slug].some((n) => n?.toLowerCase() === name));
    if (!strength) {
      console.error(`No "${doseLabel}" dose for "${productName}". Run without arguments to list them.`);
      process.exit(1);
    }
    await prisma.productStrength.update({ where: { id: strength.id }, data: { stripePriceId: priceId === 'none' ? null : priceId } });
    console.log(`${strength.product.brandName ?? strength.product.name} ${strength.label}: ${priceId === 'none' ? 'cleared' : priceId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
