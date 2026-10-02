import { ConsultationKind } from '../common/enums';

// One-click starting points for the prescriber. A template only fills in the prescription form —
// the same prescribing rules, MFA and identity checks apply when it is submitted, and the doctor
// can change anything first. It names products by catalog slug and strengths by label, so it
// follows the catalog (see prisma/catalog.ts); one whose product or strength has been withdrawn
// is simply not offered. Clinical content: change it through code review, with the medical lead.

export interface TemplateItem {
  productSlug: string;
  strengthLabel: string;
  /** Packs. */
  quantity: number;
  /** Printed on the label; defaults to the product's standard directions. */
  directions?: string;
}

export interface PrescriptionTemplateDef {
  id: string;
  kind: ConsultationKind;
  name: string;
  description: string;
  items: TemplateItem[];
  validityDays: number;
  refillsAllowed: number;
  notes?: string;
}

const weekly = (dose: string) =>
  `Inject ${dose} under the skin once a week for 4 weeks, on the same day each week (abdomen, thigh or upper arm). Rotate injection sites. Do not increase the dose unless your clinician tells you to.`;
const PACK = '4 weekly doses';

// A 4-week titration pack is one supply with no repeats: the next step is decided at the monthly check-in
// (the prescription form steps the dose up from there), so templates only cover the starting dose.
const titration = (id: string, productSlug: string, product: string, strengthLabel: string, dose: string, step: string): PrescriptionTemplateDef => ({
  id,
  kind: ConsultationKind.GLP1,
  name: `${product} ${dose} titration pack (4 weeks)`,
  description: `${step}. ${PACK}.`,
  items: [{ productSlug, strengthLabel, quantity: 1, directions: weekly(dose) }],
  validityDays: 30,
  refillsAllowed: 0,
});

export const PRESCRIPTION_TEMPLATES: PrescriptionTemplateDef[] = [
  titration('glp1-wegovy-start', 'semaglutide-wegovy', 'Semaglutide (Wegovy)', '0.25 mg', '0.25 mg', 'Starting dose, step 1'),
  titration('glp1-ozempic-start', 'semaglutide-ozempic', 'Semaglutide (Ozempic)', '0.25 mg', '0.25 mg', 'Starting dose, step 1'),
  titration('glp1-mounjaro-start', 'tirzepatide-mounjaro', 'Tirzepatide (Mounjaro)', '2.5 mg', '2.5 mg', 'Starting dose, step 1'),

  {
    id: 'hrt-gel-progesterone',
    kind: ConsultationKind.HRT,
    name: 'Estradiol gel 0.06% + micronised progesterone (continuous)',
    description: 'Transdermal estrogen with a continuous progestogen, for a patient with a uterus. 6 months.',
    items: [
      { productSlug: 'estradiol-gel-oestrogel', strengthLabel: '0.75 mg per pump', quantity: 1 },
      { productSlug: 'progesterone-utrogestan', strengthLabel: '100 mg', quantity: 1 },
    ],
    validityDays: 180,
    refillsAllowed: 5,
  },
  {
    id: 'hrt-patch-progesterone',
    kind: ConsultationKind.HRT,
    name: 'Estradiol patch 50 micrograms + micronised progesterone (continuous)',
    description: 'Transdermal estrogen patch with a continuous progestogen, for a patient with a uterus. 6 months.',
    items: [
      { productSlug: 'estradiol-patch-evorel', strengthLabel: '50 micrograms/24 h', quantity: 1 },
      { productSlug: 'progesterone-utrogestan', strengthLabel: '100 mg', quantity: 1 },
    ],
    validityDays: 180,
    refillsAllowed: 5,
  },
  {
    id: 'hrt-gel-only',
    kind: ConsultationKind.HRT,
    name: 'Estradiol gel 0.06% (no progestogen)',
    description: 'Estrogen alone, for a patient who has had a hysterectomy. 6 months.',
    items: [{ productSlug: 'estradiol-gel-oestrogel', strengthLabel: '0.75 mg per pump', quantity: 1 }],
    validityDays: 180,
    refillsAllowed: 5,
  },

  {
    id: 'trt-gel-start',
    kind: ConsultationKind.TRT,
    name: 'Testosterone gel 2% — 20 mg (2 pumps) daily',
    description: 'Starting dose. 3 months, with blood tests due before repeats.',
    items: [{ productSlug: 'testosterone-gel-tostran', strengthLabel: '20 mg (2 pumps)', quantity: 1 }],
    validityDays: 90,
    refillsAllowed: 2,
  },
  {
    id: 'trt-sustanon',
    kind: ConsultationKind.TRT,
    name: 'Testosterone (mixed esters) 250 mg/mL every 3 weeks',
    description: 'Injection every 3 weeks. 3 months, with blood tests due before repeats.',
    items: [{ productSlug: 'testosterone-injection-sustanon', strengthLabel: '250 mg/mL', quantity: 1 }],
    validityDays: 90,
    refillsAllowed: 2,
  },
];
