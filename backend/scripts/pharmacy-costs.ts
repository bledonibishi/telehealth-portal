/**
 * What the pharmacy charges us for one unit of each dose (used by the monthly pharmacy statement).
 *
 *   pnpm pharmacy-costs                                  # lists every dose with its current cost
 *   pnpm pharmacy-costs "Ozempic 0.5 mg=85.5" "Evorel 50=12"   # sets costs; "<product> <dose>=<amount>"
 *   pnpm pharmacy-costs "Ozempic 0.5 mg="                # clears one
 *
 * The product is its brand name if it has one, else its name, exactly as the statement shows it.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) (process as unknown as { loadEnvFile(p: string): void }).loadEnvFile(envFile);
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.productStrength.findMany({ include: { product: true }, orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }] });
    const name = (r: (typeof rows)[number]) => `${r.product.brandName ?? r.product.name} ${r.label}`;
    const args = process.argv.slice(2);
    for (const arg of args) {
      const at = arg.lastIndexOf('=');
      const key = arg.slice(0, at).trim();
      const raw = arg.slice(at + 1).trim();
      const matches = rows.filter((r) => name(r).toLowerCase() === key.toLowerCase());
      if (at < 0 || matches.length !== 1) { console.error(`Skipped "${arg}": ${at < 0 ? 'use "<product> <dose>=<amount>"' : matches.length ? 'more than one match' : 'no such dose (run without arguments to list them)'}`); continue; }
      const amount = raw === '' ? null : Number(raw);
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) { console.error(`Skipped "${arg}": "${raw}" is not an amount`); continue; }
      await prisma.productStrength.update({ where: { id: matches[0].id }, data: { pharmacyUnitCost: amount } });
      matches[0].pharmacyUnitCost = amount === null ? null : (amount as never);
      console.log(`${name(matches[0])} → ${amount === null ? 'cleared' : amount.toFixed(2)}`);
    }
    console.table(rows.map((r) => ({ dose: name(r), 'pharmacy cost': r.pharmacyUnitCost === null ? '—' : Number(r.pharmacyUnitCost).toFixed(2) })));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
