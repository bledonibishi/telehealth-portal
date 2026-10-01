import { SymptomScale } from '../common/enums';

// Validated symptom questionnaires, answered by the patient whenever they
// like (typically monthly) and charted over time. Item wording follows the
// published scales; the medical lead should confirm them before go-live.

export type ScaleItem = { id: string; text: string; domain: string };
export type ScaleDefinition = {
  id: SymptomScale;
  name: string;
  intro: string;
  /** Answer choices, lowest (no symptom) first. */
  options: { score: number; label: string }[];
  domains: { id: string; label: string }[];
  items: ScaleItem[];
  /** Severity bands on the total score, ascending by `min`. */
  bands: { min: number; label: string }[];
};

// Menopause Rating Scale (Heinemann et al.): 11 items scored 0–4, total 0–44.
const MRS: ScaleDefinition = {
  id: SymptomScale.MRS,
  name: 'Menopause symptoms',
  intro: 'How much has each of these bothered you over the last few weeks?',
  options: [
    { score: 0, label: 'None' },
    { score: 1, label: 'Mild' },
    { score: 2, label: 'Moderate' },
    { score: 3, label: 'Severe' },
    { score: 4, label: 'Very severe' },
  ],
  domains: [
    { id: 'somatic', label: 'Physical' },
    { id: 'psychological', label: 'Mood' },
    { id: 'urogenital', label: 'Urogenital' },
  ],
  items: [
    { id: 'hot_flushes', text: 'Hot flushes and sweating', domain: 'somatic' },
    { id: 'heart_discomfort', text: 'Heart discomfort (awareness of heartbeat, racing, skipping, tightness)', domain: 'somatic' },
    { id: 'sleep', text: 'Sleep problems (difficulty falling asleep or sleeping through, waking early)', domain: 'somatic' },
    { id: 'depressive_mood', text: 'Low mood (feeling down, sad, on the verge of tears, lack of drive)', domain: 'psychological' },
    { id: 'irritability', text: 'Irritability (feeling nervous, inner tension, aggressive)', domain: 'psychological' },
    { id: 'anxiety', text: 'Anxiety (inner restlessness, feeling panicky)', domain: 'psychological' },
    { id: 'exhaustion', text: 'Physical and mental exhaustion (less able to perform, poor memory or concentration, forgetful)', domain: 'psychological' },
    { id: 'sexual', text: 'Sexual problems (change in desire, activity or satisfaction)', domain: 'urogenital' },
    { id: 'bladder', text: 'Bladder problems (difficulty or needing to pass urine more often, leaking)', domain: 'urogenital' },
    { id: 'vaginal_dryness', text: 'Vaginal dryness (dryness or burning, difficulty with intercourse)', domain: 'urogenital' },
    { id: 'joint_muscle', text: 'Joint and muscle discomfort (aches in the joints, rheumatic-type pain)', domain: 'somatic' },
  ],
  bands: [
    { min: 0, label: 'Little or none' },
    { min: 5, label: 'Mild' },
    { min: 9, label: 'Moderate' },
    { min: 17, label: 'Severe' },
  ],
};

// Aging Males' Symptoms scale (Heinemann et al.): 17 items scored 1–5, total 17–85.
const AMS: ScaleDefinition = {
  id: SymptomScale.AMS,
  name: 'Testosterone symptoms',
  intro: 'How much has each of these affected you over the last few weeks?',
  options: [
    { score: 1, label: 'None' },
    { score: 2, label: 'Mild' },
    { score: 3, label: 'Moderate' },
    { score: 4, label: 'Severe' },
    { score: 5, label: 'Extremely severe' },
  ],
  domains: [
    { id: 'psychological', label: 'Mood' },
    { id: 'somatic', label: 'Physical' },
    { id: 'sexual', label: 'Sexual' },
  ],
  items: [
    { id: 'wellbeing', text: 'Decline in your general feeling of well-being', domain: 'somatic' },
    { id: 'joint_muscle', text: 'Joint pain and muscle ache', domain: 'somatic' },
    { id: 'sweating', text: 'Excessive sweating (unexpected episodes, hot flushes)', domain: 'somatic' },
    { id: 'sleep', text: 'Sleep problems', domain: 'somatic' },
    { id: 'tiredness', text: 'Needing more sleep, often feeling tired', domain: 'somatic' },
    { id: 'irritability', text: 'Irritability', domain: 'psychological' },
    { id: 'nervousness', text: 'Nervousness', domain: 'psychological' },
    { id: 'anxiety', text: 'Anxiety (feeling panicky)', domain: 'psychological' },
    { id: 'exhaustion', text: 'Physical exhaustion or lacking vitality', domain: 'somatic' },
    { id: 'strength', text: 'Decrease in muscle strength', domain: 'somatic' },
    { id: 'depressive_mood', text: 'Low mood (feeling down, sad, lacking drive)', domain: 'psychological' },
    { id: 'past_peak', text: 'Feeling that you have passed your peak', domain: 'sexual' },
    { id: 'burnt_out', text: 'Feeling burnt out, having hit rock bottom', domain: 'psychological' },
    { id: 'beard_growth', text: 'Decrease in beard growth', domain: 'sexual' },
    { id: 'sexual_performance', text: 'Decrease in ability or frequency to perform sexually', domain: 'sexual' },
    { id: 'morning_erections', text: 'Fewer morning erections', domain: 'sexual' },
    { id: 'libido', text: 'Decrease in sexual desire (libido)', domain: 'sexual' },
  ],
  bands: [
    { min: 17, label: 'Little or none' },
    { min: 27, label: 'Mild' },
    { min: 37, label: 'Moderate' },
    { min: 50, label: 'Severe' },
  ],
};

export const SCALES: Record<SymptomScale, ScaleDefinition> = { MRS, AMS };

// Which scale each programme uses. Keyed by the programme's kind as a string
// so TRT picks up the AMS as soon as that kind exists; GLP-1 has none (its
// progress is the Weight Journey).
const SCALE_FOR_KIND: Record<string, SymptomScale> = { HRT: SymptomScale.MRS, TRT: SymptomScale.AMS };

export function scaleForKind(kind: string | null | undefined): ScaleDefinition | null {
  const id = kind ? SCALE_FOR_KIND[kind] : undefined;
  return id ? SCALES[id] : null;
}

export const minScore = (s: ScaleDefinition) => s.options[0].score * s.items.length;
export const maxScore = (s: ScaleDefinition) => s.options[s.options.length - 1].score * s.items.length;

export function severityOf(s: ScaleDefinition, total: number): string {
  let label = s.bands[0].label;
  for (const b of s.bands) if (total >= b.min) label = b.label;
  return label;
}

export type ScoredAnswer = { itemId: string; score: number };

/** Checks every item is answered exactly once with a valid score; returns them in item order. */
export function validateAnswers(s: ScaleDefinition, answers: ScoredAnswer[]): { answers: ScoredAnswer[]; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map<string, number>();
  const valid = new Set(s.options.map((o) => o.score));
  for (const a of answers) {
    if (!s.items.some((i) => i.id === a.itemId)) errors.push(`Unknown symptom "${a.itemId}".`);
    else if (byId.has(a.itemId)) errors.push(`"${a.itemId}" was answered more than once.`);
    else if (!valid.has(a.score)) errors.push(`"${a.itemId}" has an invalid score.`);
    else byId.set(a.itemId, a.score);
  }
  const missing = s.items.filter((i) => !byId.has(i.id));
  if (missing.length) errors.push(`Please answer every question (${missing.length} left).`);
  return { answers: s.items.filter((i) => byId.has(i.id)).map((i) => ({ itemId: i.id, score: byId.get(i.id)! })), errors };
}

export function domainScores(s: ScaleDefinition, answers: ScoredAnswer[]) {
  const top = s.options[s.options.length - 1].score;
  const bottom = s.options[0].score;
  return s.domains.map((d) => {
    const items = s.items.filter((i) => i.domain === d.id);
    const score = items.reduce((sum, i) => sum + (answers.find((a) => a.itemId === i.id)?.score ?? bottom), 0);
    return { domain: d.id, label: d.label, score, min: bottom * items.length, max: top * items.length };
  });
}
