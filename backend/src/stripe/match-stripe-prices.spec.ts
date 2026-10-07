import { CatalogStrength, matchPrices, StripePriceInfo, strengthsFor } from './match-stripe-prices';

const s = (productName: string, label: string, aliases: string[] = []): CatalogStrength => ({
  id: `${productName}-${label}`,
  label,
  productName,
  productAliases: [productName, ...aliases],
  stripePriceId: null,
});

const CATALOG = [
  s('Mounjaro', '2.5 mg', ['Tirzepatide']),
  s('Mounjaro', '7.5 mg', ['Tirzepatide']),
  s('Mounjaro', '12.5 mg', ['Tirzepatide']),
  s('Wegovy', '0.25 mg', ['Semaglutide']),
  s('Ozempic', '0.25 mg', ['Semaglutide']),
  s('Oestrogel', '0.75 mg per pump'),
  s('Sandrena', '0.5 mg sachet'),
  s('Sandrena', '1 mg sachet'),
  s('Evorel', '25 micrograms/24 h'),
  s('Evorel', '50 micrograms/24 h'),
  s('Tostran', '20 mg (2 pumps)'),
];

const price = (productName: string, id: string, recurring = true): StripePriceInfo => ({ id, productName, recurring, amountCents: 100, currency: 'eur' });

describe('strengthsFor', () => {
  const labels = (name: string) => strengthsFor(name, CATALOG).map((x) => `${x.productName} ${x.label}`);

  it('matches a dose written with or without a space', () => {
    expect(labels('Mounjaro 7.5mg')).toEqual(['Mounjaro 7.5 mg']);
    expect(labels('Wegovy 0.25 mg')).toEqual(['Wegovy 0.25 mg']);
  });

  it('does not read 12.5 as 2.5', () => {
    expect(labels('Mounjaro 12.5mg')).toEqual(['Mounjaro 12.5 mg']);
  });

  it('prices every dose of a product when the Stripe name has no dose', () => {
    expect(labels('Evorel patches (any strength)')).toEqual(['Evorel 25 micrograms/24 h', 'Evorel 50 micrograms/24 h']);
    expect(labels('Oestrogel (80 g pump)')).toEqual(['Oestrogel 0.75 mg per pump']);
    expect(labels('Tostran 2% (60 g)')).toEqual(['Tostran 20 mg (2 pumps)']);
  });

  it('matches by brand, so Wegovy and Ozempic (both semaglutide) stay apart', () => {
    expect(labels('Sandrena 1 mg (28 sachets)')).toEqual(['Sandrena 1 mg sachet']);
    expect(labels('Ozempic 0.25 mg')).toEqual(['Ozempic 0.25 mg']);
  });

  it('ignores plan tiers', () => {
    expect(labels('GLP-1 Advanced')).toEqual([]);
  });
});

describe('matchPrices', () => {
  it('pairs recurring prices, reports one-off prices, unpriced doses and unknown products', () => {
    const result = matchPrices(CATALOG, [
      price('Mounjaro 7.5mg', 'price_m75'),
      price('Mounjaro 7.5mg', 'price_m75_once', false),
      price('GLP-1 Starter', 'price_tier'),
    ]);
    expect(result.matches.map((m) => [m.strength.label, m.price.id])).toEqual([['7.5 mg', 'price_m75']]);
    expect(result.oneOff.map((m) => m.price.id)).toEqual(['price_m75_once']);
    expect(result.unmatchedProducts).toEqual(['GLP-1 Starter']);
    expect(result.unpriced).toHaveLength(CATALOG.length - 1);
  });
});
