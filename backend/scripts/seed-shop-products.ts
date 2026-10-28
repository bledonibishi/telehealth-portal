/**
 * Dev only: sample products for trying the shop (website /shop, clinician Shop page).
 *
 *   cd backend
 *   pnpm seed-shop-products            # adds the samples, or resets their price and stock
 *   pnpm seed-shop-products --clear    # removes them (or takes them off sale if they were ordered)
 *
 * Every sample's address starts with "sample-" and its brand is "Sample"; nothing else is touched. One of them is out
 * of stock on purpose. Uses DATABASE_URL from the environment, or else from backend/.env, and refuses to run against
 * a database that isn't on this machine.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

const image = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

const SAMPLES = [
  { slug: 'sample-whey-protein-vanilla-1kg', name: 'Whey protein, vanilla, 1 kg', category: 'Protein', priceCents: 2990, stock: 25, image: 'photo-1593095948071-474c5cc2989d', description: 'Whey protein powder with vanilla flavour. About 33 servings of 30 g.\nMix one scoop with 250 ml of water or milk.' },
  { slug: 'sample-plant-protein-chocolate-750g', name: 'Plant protein, chocolate, 750 g', category: 'Protein', priceCents: 2750, stock: 25, image: 'photo-1546483875-ad9014c88eba', description: 'Pea and rice protein powder with cocoa. About 25 servings of 30 g.\nSuitable for vegans.' },
  { slug: 'sample-creatine-monohydrate-300g', name: 'Creatine monohydrate, 300 g', category: 'Sports', priceCents: 1990, stock: 25, image: 'photo-1517836357463-d25dfeac3438', description: 'Unflavoured creatine monohydrate powder. 100 servings of 3 g.' },
  { slug: 'sample-vitamin-d3-drops-30ml', name: 'Vitamin D3 drops, 30 ml', category: 'Vitamins', priceCents: 990, stock: 25, image: 'photo-1620916297397-a4a5402a3c6c', description: 'Vitamin D3 in olive oil. 1000 IU per drop.\nDo not exceed the stated daily dose.' },
  { slug: 'sample-omega-3-60-capsules', name: 'Omega-3 fish oil, 60 capsules', category: 'Vitamins', priceCents: 1490, stock: 25, image: 'photo-1628771065518-0d82f1938462', description: 'Fish oil capsules with EPA and DHA. Two capsules a day with food.' },
  { slug: 'sample-magnesium-citrate-60-capsules', name: 'Magnesium citrate, 60 capsules', category: 'Minerals', priceCents: 1150, stock: 25, image: 'photo-1471864190281-a93a3070b6de', description: 'Magnesium citrate capsules. Two capsules a day.' },
  { slug: 'sample-multivitamin-30-tablets', name: 'Daily multivitamin, 30 tablets', category: 'Vitamins', priceCents: 1290, stock: 25, image: 'photo-1584017911766-d451b3d0e843', description: 'A daily multivitamin and mineral tablet. One tablet a day with breakfast.' },
  { slug: 'sample-electrolyte-mix-20-sachets', name: 'Electrolyte drink mix, 20 sachets', category: 'Sports', priceCents: 990, stock: 0, image: 'photo-1544367567-0f2fcb009e0b', description: 'Lemon-flavoured electrolyte powder. One sachet in 500 ml of water.\n(Out of stock on purpose, to try how the shop shows it.)' },
];

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Not available in production.');
    process.exit(1);
  }
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to write samples there.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    if (process.argv.includes('--clear')) {
      const samples = { slug: { startsWith: 'sample-' }, brand: 'Sample' };
      // A sample that was ordered can't be deleted without losing the order; it is taken off sale instead.
      const ordered = await prisma.shopProduct.updateMany({ where: { ...samples, items: { some: {} } }, data: { active: false } });
      const removed = await prisma.shopProduct.deleteMany({ where: { ...samples, items: { none: {} } } });
      console.log(`Removed ${removed.count} sample product(s)${ordered.count ? `; ${ordered.count} that were ordered are now off sale` : ''}.`);
      return;
    }

    for (const [i, s] of SAMPLES.entries()) {
      const data = { name: s.name, brand: 'Sample', category: s.category, description: s.description, imageUrl: image(s.image), priceCents: s.priceCents, stock: s.stock, maxPerOrder: 5, active: true, sortOrder: (i + 1) * 10 };
      await prisma.shopProduct.upsert({ where: { slug: s.slug }, create: { slug: s.slug, ...data }, update: data });
    }
    console.log(`Added ${SAMPLES.length} sample products. See them at /shop on the website, and under Shop → Products in the clinician portal.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
