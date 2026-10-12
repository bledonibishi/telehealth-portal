import { ConsultationKind } from '../common/enums';
import { MAX_QUANTITY } from '../prescriptions/prescribing-rules';
import { CatalogService } from './catalog.service';
import { PRESCRIPTION_TEMPLATES } from './prescription-templates';

// The seed file lives outside src/, so it is required rather than imported (it also keeps tsc's rootDir happy).
const { CATALOG } = require('../../prisma/catalog') as {
  CATALOG: Array<{ slug: string; kind: string; active?: boolean; directions: string; strengths: Array<{ label: string }> }>;
};

describe('PRESCRIPTION_TEMPLATES', () => {
  it('has unique ids', () => {
    const ids = PRESCRIPTION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PRESCRIPTION_TEMPLATES.map((t) => [t.id, t] as const))('%s only uses seeded products and strengths of its own programme', (_id, t) => {
    expect(t.items.length).toBeGreaterThan(0);
    for (const item of t.items) {
      const product = CATALOG.find((p) => p.slug === item.productSlug);
      expect(product).toBeDefined();
      expect(product!.kind).toBe(t.kind);
      expect(product!.active).not.toBe(false);
      expect(product!.strengths.map((s) => s.label)).toContain(item.strengthLabel);
      expect(item.quantity).toBeGreaterThanOrEqual(1);
      expect(item.quantity).toBeLessThanOrEqual(MAX_QUANTITY);
      // Directions come from the template or, failing that, the product's own.
      expect(item.directions ?? product!.directions).toBeTruthy();
    }
    expect(t.validityDays).toBeGreaterThanOrEqual(1);
    expect(t.validityDays).toBeLessThanOrEqual(365);
    expect(t.refillsAllowed).toBeGreaterThanOrEqual(0);
    expect(t.refillsAllowed).toBeLessThanOrEqual(11);
  });

  it('offers the 4-week semaglutide starter pack the doctors asked for', () => {
    const t = PRESCRIPTION_TEMPLATES.find((x) => x.id === 'glp1-wegovy-start')!;
    expect(t.name).toBe('Semaglutide (Wegovy) 0.25 mg titration pack (4 weeks)');
    expect(t.items[0].directions).toContain('0.25 mg');
  });
});

describe('CatalogService.findTemplates', () => {
  const wegovy = {
    id: 'prod-wegovy', slug: 'semaglutide-wegovy', defaultDirections: 'Standard directions',
    strengths: [{ id: 'str-025', label: '0.25 mg' }, { id: 'str-05', label: '0.5 mg' }],
  };
  const build = (products: any[]) => {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue(products) } };
    return { service: new CatalogService(prisma as any), prisma };
  };

  it('resolves a template to the catalog ids and fills in the directions', async () => {
    const { service } = build([wegovy]);
    const templates = await service.findTemplates(ConsultationKind.GLP1);
    const t = templates.find((x) => x.id === 'glp1-wegovy-start')!;
    expect(t.items).toEqual([{ productId: 'prod-wegovy', strengthId: 'str-025', quantity: 1, directions: expect.stringContaining('0.25 mg') }]);
    expect(t.validityDays).toBe(30);
    expect(t.refillsAllowed).toBe(0);
  });

  it('only asks for the active catalog of the programme', async () => {
    const { service, prisma } = build([wegovy]);
    await service.findTemplates(ConsultationKind.GLP1);
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { kind: 'GLP1', active: true } }));
  });

  it('leaves out a template whose product or strength is no longer in the catalog', async () => {
    // Wegovy has no 0.25 mg strength any more, and every other product is gone.
    const { service } = build([{ ...wegovy, strengths: [{ id: 'str-05', label: '0.5 mg' }] }]);
    expect(await service.findTemplates(ConsultationKind.GLP1)).toEqual([]);
  });

  it('leaves out a combination when one of its medicines is missing', async () => {
    const gel = { id: 'p-gel', slug: 'estradiol-gel-oestrogel', defaultDirections: 'Apply 2 pumps', strengths: [{ id: 's-gel', label: '0.75 mg per pump' }] };
    const { service } = build([gel]); // no progesterone
    const ids = (await service.findTemplates(ConsultationKind.HRT)).map((t) => t.id);
    expect(ids).toEqual(['hrt-gel-only']);
  });
});
