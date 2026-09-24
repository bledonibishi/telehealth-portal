export type ProductKey = 'hrt' | 'glp1';

export interface Option {
  id: string;
  label: string;
  /** Selecting this option makes the user ineligible */
  disqualifies?: boolean;
  /** "None of the above" — mutually exclusive with all other options */
  noneOfAbove?: boolean;
  /** Must have at least one option without this flag selected (positive confirmation) */
  isPositive?: boolean;
}

export interface Question {
  id: string;
  text: string;
  subtext?: string;
  type: 'single' | 'multi';
  options: Option[];
  /** At least one option with isPositive:true must be chosen */
  requiresPositive?: boolean;
}

export const HRT_QUESTIONS: Question[] = [
  {
    id: 'age',
    text: 'How old are you?',
    type: 'single',
    options: [
      { id: 'under18', label: 'Under 18', disqualifies: true },
      { id: '18to45', label: '18 – 45', isPositive: true },
      { id: '46to55', label: '46 – 55', isPositive: true },
      { id: '56to65', label: '56 – 65', isPositive: true },
      { id: 'over65', label: 'Over 65', disqualifies: true },
    ],
  },
  {
    id: 'symptoms',
    text: 'Which symptoms are you currently experiencing?',
    subtext: 'Select all that apply.',
    type: 'multi',
    requiresPositive: true,
    options: [
      { id: 'hot_flushes', label: 'Hot flushes or night sweats', isPositive: true },
      { id: 'mood', label: 'Mood changes, anxiety or depression', isPositive: true },
      { id: 'brain_fog', label: 'Brain fog or poor concentration', isPositive: true },
      { id: 'libido', label: 'Low libido', isPositive: true },
      { id: 'sleep', label: 'Sleep disturbances', isPositive: true },
      { id: 'joint_pain', label: 'Joint pain or muscle aches', isPositive: true },
      { id: 'none', label: 'None of the above', noneOfAbove: true, disqualifies: true },
    ],
  },
  {
    id: 'contraindications',
    text: 'Have you ever been diagnosed with any of the following?',
    subtext: 'Select all that apply.',
    type: 'multi',
    options: [
      { id: 'breast_cancer', label: 'Breast cancer or hormone-sensitive cancer', disqualifies: true },
      { id: 'blood_clots', label: 'Blood clots (DVT or pulmonary embolism)', disqualifies: true },
      { id: 'stroke', label: 'Stroke or heart attack in the past 12 months', disqualifies: true },
      { id: 'undiagnosed_bleeding', label: 'Unexplained vaginal bleeding', disqualifies: true },
      { id: 'none', label: 'None of the above', noneOfAbove: true },
    ],
  },
  {
    id: 'pregnancy',
    text: 'Are you currently pregnant or breastfeeding?',
    type: 'single',
    options: [
      { id: 'yes', label: 'Yes', disqualifies: true },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'hypertension',
    text: 'Do you have uncontrolled high blood pressure (above 160/100 mmHg)?',
    type: 'single',
    options: [
      { id: 'yes', label: 'Yes', disqualifies: true },
      { id: 'no', label: 'No' },
      { id: 'unknown', label: "I don't know" },
    ],
  },
];

export const GLP1_QUESTIONS: Question[] = [
  {
    id: 'age',
    text: 'How old are you?',
    type: 'single',
    options: [
      { id: 'under18', label: 'Under 18', disqualifies: true },
      { id: '18to75', label: '18 – 75', isPositive: true },
      { id: 'over75', label: 'Over 75', disqualifies: true },
    ],
  },
  {
    id: 'bmi',
    text: 'What is your approximate BMI?',
    subtext:
      'GLP-1 treatment is suitable for a BMI of 30+ or 27–29 with a weight-related health condition.',
    type: 'single',
    options: [
      { id: 'under27', label: 'Under 27', disqualifies: true },
      {
        id: '27to29_condition',
        label: '27 – 29, and I have a weight-related condition (e.g. type 2 diabetes, high blood pressure)',
        isPositive: true,
      },
      { id: '30plus', label: '30 or above', isPositive: true },
      { id: 'unknown', label: "I don't know my BMI" },
    ],
    requiresPositive: true,
  },
  {
    id: 'contraindications',
    text: 'Have you ever been diagnosed with any of the following?',
    subtext: 'Select all that apply.',
    type: 'multi',
    options: [
      { id: 'type1_diabetes', label: 'Type 1 diabetes', disqualifies: true },
      {
        id: 'mtc',
        label: 'Medullary thyroid carcinoma (MTC) or MEN2 syndrome',
        disqualifies: true,
      },
      { id: 'pancreatitis', label: 'Pancreatitis', disqualifies: true },
      { id: 'none', label: 'None of the above', noneOfAbove: true },
    ],
  },
  {
    id: 'pregnancy',
    text: 'Are you currently pregnant, breastfeeding, or planning to become pregnant in the next 6 months?',
    type: 'single',
    options: [
      { id: 'yes', label: 'Yes', disqualifies: true },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'gi_disorders',
    text: 'Do you have a history of severe gastrointestinal disorders (e.g. gastroparesis or inflammatory bowel disease)?',
    type: 'single',
    options: [
      { id: 'yes', label: 'Yes', disqualifies: true },
      { id: 'no', label: 'No' },
    ],
  },
];

export const QUIZZES: Record<ProductKey, { title: string; questions: Question[] }> = {
  hrt: { title: 'HRT Eligibility', questions: HRT_QUESTIONS },
  glp1: { title: 'GLP-1 Eligibility', questions: GLP1_QUESTIONS },
};

/** Returns true if the selected option IDs make the user ineligible */
export function isDisqualified(question: Question, selectedIds: string[]): boolean {
  return question.options.some((o) => o.disqualifies && selectedIds.includes(o.id));
}

/** Returns true if a question requiring a positive selection has at least one positive answer */
export function hasPositiveSelection(question: Question, selectedIds: string[]): boolean {
  if (!question.requiresPositive) return true;
  return question.options.some((o) => o.isPositive && selectedIds.includes(o.id));
}

export function checkEligibility(
  questions: Question[],
  answers: Record<string, string[]>,
): 'eligible' | 'ineligible' {
  for (const q of questions) {
    const selected = answers[q.id] ?? [];
    if (isDisqualified(q, selected)) return 'ineligible';
    if (q.requiresPositive && !hasPositiveSelection(q, selected)) return 'ineligible';
  }
  return 'eligible';
}
