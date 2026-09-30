import { ConsultationKind, ProductCategory } from '../common/enums';

export interface RuleItem {
  product: { id: string; name: string; kind: ConsultationKind | string; category: ProductCategory | string; active: boolean };
  strength: { label: string; titrationStep: number | null; active: boolean; productId: string };
  quantity: number;
}

export interface RuleContext {
  kind: ConsultationKind | string;
  items: RuleItem[];
  answers: Array<{ questionId: string; answer: string; value?: string | null }>;
  // Verified at onboarding (with proof) — self-reported quiz answers don't count.
  verifiedPriorGlp1Use: boolean;
  // Titration step of the GLP-1 the patient is currently prescribed, if any.
  currentGlp1Step: number | null;
}

export interface RuleViolation {
  code: string;
  message: string;
  // Overridable rules are clinical judgement calls: the prescriber may proceed
  // by recording a reason. The rest are never valid prescriptions.
  overridable: boolean;
}

export const MAX_QUANTITY = 12;

function answerOf(ctx: RuleContext, questionId: string): string | null {
  const found = ctx.answers.find((a) => a.questionId === questionId);
  // Prefer the questionnaire's stable option value over the display label.
  return found ? (found.value ?? found.answer).trim().toLowerCase() : null;
}

export function checkPrescribingRules(ctx: RuleContext): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const hard = (code: string, message: string) => violations.push({ code, message, overridable: false });
  const soft = (code: string, message: string) => violations.push({ code, message, overridable: true });

  if (ctx.items.length === 0) {
    hard('NO_ITEMS', 'Add at least one medicine to the prescription');
    return violations;
  }

  const seen = new Set<string>();
  for (const item of ctx.items) {
    const name = `${item.product.name} ${item.strength.label}`;
    if (item.strength.productId !== item.product.id) hard('STRENGTH_MISMATCH', `${name}: strength does not belong to this product`);
    if (!item.product.active || !item.strength.active) hard('INACTIVE_PRODUCT', `${name} is not currently available to prescribe`);
    if (item.product.kind !== ctx.kind) hard('KIND_MISMATCH', `${item.product.name} is not a ${ctx.kind} medicine`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      hard('QUANTITY', `${name}: quantity must be between 1 and ${MAX_QUANTITY}`);
    }
    if (seen.has(item.product.id)) hard('DUPLICATE_PRODUCT', `${item.product.name} appears more than once`);
    seen.add(item.product.id);
  }

  const glp1 = ctx.items.filter((i) => i.product.category === ProductCategory.GLP1);
  if (glp1.length > 1) hard('MULTIPLE_GLP1', 'Only one GLP-1 medicine can be prescribed at a time');

  const glp1Step = glp1[0]?.strength.titrationStep ?? null;
  if (glp1Step !== null) {
    if (ctx.currentGlp1Step !== null) {
      if (glp1Step > ctx.currentGlp1Step + 1) {
        soft(
          'GLP1_STEP_JUMP',
          `Dose jumps from titration step ${ctx.currentGlp1Step} to ${glp1Step}; the protocol increases one step at a time`,
        );
      }
    } else if (glp1Step > 1 && !ctx.verifiedPriorGlp1Use) {
      soft(
        'GLP1_START_DOSE',
        'Patients new to GLP-1 treatment start on the lowest dose; no verified prior use is on file',
      );
    }
  }

  const hasEstrogen = ctx.items.some((i) => i.product.category === ProductCategory.ESTROGEN);
  const hasProgestogen = ctx.items.some((i) => i.product.category === ProductCategory.PROGESTOGEN);
  if (hasEstrogen && !hasProgestogen && answerOf(ctx, 'has_uterus') !== 'no') {
    soft(
      'ESTROGEN_WITHOUT_PROGESTOGEN',
      'Estrogen without a progestogen raises endometrial cancer risk for anyone with a uterus. Add a progestogen, or record why it is not needed (e.g. hysterectomy, hormonal IUD in place).',
    );
  }

  const hasTestosterone = ctx.items.some((i) => i.product.category === ProductCategory.TESTOSTERONE);
  if (hasTestosterone && answerOf(ctx, 'prostate_cancer_history') === 'yes') {
    soft(
      'TESTOSTERONE_PROSTATE_HISTORY',
      'Testosterone is contraindicated with a history of prostate cancer without specialist sign-off. Confirm oncology clearance, or do not proceed.',
    );
  }

  return violations;
}
