import { DosePricingService } from './dose-pricing.service';

const service = (env: Record<string, string>) => new DosePricingService({ get: (k: string) => env[k] } as any, {} as any);
const hrt = (withProgesterone: boolean) => [
  { category: 'ESTROGEN', titrationStep: null, stripePriceId: null },
  ...(withProgesterone ? [{ category: 'PROGESTOGEN', titrationStep: null, stripePriceId: null }] : []),
];

describe('DosePricingService.priceIdFor', () => {
  it('reads the HRT plans by what they contain', () => {
    const s = service({ STRIPE_PRICE_OESTROGEN: 'price_o', STRIPE_PRICE_OESTROGEN_PROGESTERONE: 'price_op' });
    expect(s.priceIdFor('HRT', hrt(false))).toBe('price_o');
    expect(s.priceIdFor('HRT', hrt(true))).toBe('price_op');
  });

  it('still reads the older STRIPE_PRICE_HRT_* names', () => {
    expect(service({ STRIPE_PRICE_HRT_COMPLETE: 'price_old' }).priceIdFor('HRT', hrt(true))).toBe('price_old');
  });

  it('prefers a GLP-1 dose’s own price, and has none without one or a tier', () => {
    const s = service({});
    expect(s.priceIdFor('GLP1', [{ category: 'GLP1', titrationStep: 3, stripePriceId: 'price_m75' }])).toBe('price_m75');
    expect(s.priceIdFor('GLP1', [{ category: 'GLP1', titrationStep: 3, stripePriceId: null }])).toBeNull();
  });
});
