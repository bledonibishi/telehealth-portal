import { RuleContext, RuleItem, checkPrescribingRules } from './prescribing-rules';

const product = (over: Partial<RuleItem['product']> = {}): RuleItem['product'] => ({
  id: 'sema', name: 'Semaglutide', kind: 'GLP1', category: 'GLP1', active: true, ...over,
});
const item = (step: number | null, over: Partial<RuleItem> = {}): RuleItem => {
  const p = over.product ?? product();
  return {
    product: p,
    strength: { label: `step ${step}`, titrationStep: step, active: true, productId: p.id },
    quantity: 1,
    ...over,
  };
};
const ctx = (over: Partial<RuleContext>): RuleContext => ({
  kind: 'GLP1', items: [], answers: [], verifiedPriorGlp1Use: false, currentGlp1Step: null, ...over,
});
const codes = (c: RuleContext) => checkPrescribingRules(c).map((v) => `${v.code}:${v.overridable ? 'soft' : 'hard'}`);

const estradiol = product({ id: 'e2', name: 'Estradiol', kind: 'HRT', category: 'ESTROGEN' });
const progesterone = product({ id: 'p4', name: 'Progesterone', kind: 'HRT', category: 'PROGESTOGEN' });

describe('checkPrescribingRules', () => {
  it('requires at least one item', () => {
    expect(codes(ctx({}))).toEqual(['NO_ITEMS:hard']);
  });

  it('accepts a new GLP-1 patient on the starting dose', () => {
    expect(codes(ctx({ items: [item(1)] }))).toEqual([]);
  });

  it('flags a new GLP-1 patient started above the lowest dose', () => {
    expect(codes(ctx({ items: [item(3)] }))).toEqual(['GLP1_START_DOSE:soft']);
  });

  it('allows a higher start when prior use is verified', () => {
    expect(codes(ctx({ items: [item(3)], verifiedPriorGlp1Use: true }))).toEqual([]);
  });

  it('allows stepping up one titration step, flags skipping steps', () => {
    expect(codes(ctx({ items: [item(3)], currentGlp1Step: 2 }))).toEqual([]);
    expect(codes(ctx({ items: [item(4)], currentGlp1Step: 2 }))).toEqual(['GLP1_STEP_JUMP:soft']);
  });

  it('rejects two GLP-1 medicines together', () => {
    const other = product({ id: 'other' });
    expect(codes(ctx({ items: [item(1), item(1, { product: other, strength: { label: 'x', titrationStep: 1, active: true, productId: 'other' } })] })))
      .toContain('MULTIPLE_GLP1:hard');
  });

  it('rejects a medicine from the other programme', () => {
    expect(codes(ctx({ kind: 'HRT', items: [item(1)] }))).toContain('KIND_MISMATCH:hard');
  });

  it('rejects withdrawn products and out-of-range quantities', () => {
    expect(codes(ctx({ items: [item(1, { product: product({ active: false }) })] }))).toContain('INACTIVE_PRODUCT:hard');
    expect(codes(ctx({ items: [item(1, { quantity: 0 })] }))).toContain('QUANTITY:hard');
    expect(codes(ctx({ items: [item(1, { quantity: 13 })] }))).toContain('QUANTITY:hard');
  });

  describe('estrogen and progestogen', () => {
    const e2 = item(null, { product: estradiol, strength: { label: '0.06%', titrationStep: null, active: true, productId: 'e2' } });
    const p4 = item(null, { product: progesterone, strength: { label: '100 mg', titrationStep: null, active: true, productId: 'p4' } });

    it('flags estrogen alone when the patient has a uterus', () => {
      expect(codes(ctx({ kind: 'HRT', items: [e2], answers: [{ questionId: 'has_uterus', answer: 'Yes' }] })))
        .toEqual(['ESTROGEN_WITHOUT_PROGESTOGEN:soft']);
    });

    it('flags estrogen alone when uterus status is unknown', () => {
      expect(codes(ctx({ kind: 'HRT', items: [e2] }))).toEqual(['ESTROGEN_WITHOUT_PROGESTOGEN:soft']);
    });

    it('accepts estrogen alone after a hysterectomy', () => {
      expect(codes(ctx({ kind: 'HRT', items: [e2], answers: [{ questionId: 'has_uterus', answer: 'no' }] }))).toEqual([]);
    });

    it('accepts estrogen with a progestogen', () => {
      expect(codes(ctx({ kind: 'HRT', items: [e2, p4], answers: [{ questionId: 'has_uterus', answer: 'yes' }] }))).toEqual([]);
    });
  });
});
