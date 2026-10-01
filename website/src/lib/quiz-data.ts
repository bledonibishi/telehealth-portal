import type { ProductKind } from './config';

export interface QuizOption {
  l: string;
  dq?: string;
  x?: boolean;
  band?: string;
  calc?: boolean;
}

export interface QuizQuestion {
  id: string;
  q: string;
  help?: string;
  type: 'single' | 'multi';
  options: QuizOption[];
  showIf?: (state: { bmiBand: string | null }) => boolean;
}

const NONE = 'None of the above';
const HIST = "Based on your medical history, it wouldn't be safe for us to prescribe this treatment online.";

export const QUIZZES: Record<ProductKind, QuizQuestion[]> = {
  HRT: [
    {
      id: 'age',
      q: 'What is your age?',
      type: 'single',
      options: [
        { l: 'Under 18', dq: 'HRT through our service is only available to adults aged 18 to 65.' },
        { l: '18 to 39' },
        { l: '40 to 54' },
        { l: '55 to 65' },
        { l: 'Over 65', dq: 'HRT through our service is only available to adults aged 18 to 65. Your own doctor can advise on options after 65.' },
      ],
    },
    {
      id: 'symptoms',
      q: 'Which symptoms are you experiencing?',
      help: 'Select all that apply.',
      type: 'multi',
      options: [
        { l: 'Hot flushes or night sweats' },
        { l: 'Mood changes or anxiety' },
        { l: 'Brain fog' },
        { l: 'Low libido' },
        { l: 'Sleep disturbances' },
        { l: 'Joint or muscle pain' },
        { l: NONE, x: true, dq: "HRT is prescribed to relieve menopause symptoms, so it isn't the right treatment if you're not experiencing any." },
      ],
    },
    {
      id: 'medical_history',
      q: 'Have you ever had any of the following?',
      help: 'Select all that apply.',
      type: 'multi',
      options: [
        { l: 'Breast cancer', dq: HIST },
        { l: 'Blood clots (DVT or PE)', dq: HIST },
        { l: 'Stroke or heart attack in the past 12 months', dq: HIST },
        { l: 'Unexplained vaginal bleeding', dq: HIST },
        { l: NONE, x: true },
      ],
    },
    {
      id: 'pregnancy',
      q: 'Are you currently pregnant?',
      type: 'single',
      options: [
        { l: 'Yes', dq: "HRT can't be prescribed during pregnancy." },
        { l: 'No' },
      ],
    },
    {
      id: 'blood_pressure',
      q: 'Do you have uncontrolled high blood pressure (above 160/100)?',
      type: 'single',
      options: [
        { l: 'Yes', dq: 'Uncontrolled high blood pressure needs to be treated and stable before HRT can be considered.' },
        { l: 'No' },
      ],
    },
  ],
  GLP1: [
    {
      id: 'age',
      q: 'What is your age?',
      type: 'single',
      options: [
        { l: 'Under 18', dq: 'GLP-1 treatment through our service is only available to adults aged 18 to 75.' },
        { l: '18 to 39' },
        { l: '40 to 59' },
        { l: '60 to 75' },
        { l: 'Over 75', dq: 'GLP-1 treatment through our service is only available to adults aged 18 to 75.' },
      ],
    },
    {
      id: 'bmi',
      q: 'What is your BMI?',
      help: "Not sure? Choose \"I don't know\" and we'll work it out from your height and weight.",
      type: 'single',
      options: [
        { l: '30 or above', band: '30+' },
        { l: '27 to 29.9', band: '27-29' },
        { l: 'Under 27', dq: 'GLP-1 treatment is only prescribed for a BMI of 27 or above.' },
        { l: "I don't know", calc: true },
      ],
    },
    {
      id: 'weight_conditions',
      q: 'Do you have either of these conditions?',
      help: 'Required when your BMI is between 27 and 29.9. Select all that apply.',
      type: 'multi',
      showIf: (s) => s.bmiBand === '27-29',
      options: [
        { l: 'Type 2 diabetes or prediabetes' },
        { l: 'High blood pressure' },
        { l: 'Neither of these', x: true, dq: 'With a BMI between 27 and 29.9, GLP-1 treatment requires a weight-related condition such as type 2 diabetes or high blood pressure.' },
      ],
    },
    {
      id: 'medical_history',
      q: 'Have you ever had any of the following?',
      help: 'Select all that apply.',
      type: 'multi',
      options: [
        { l: 'Type 1 diabetes', dq: HIST },
        { l: 'Medullary thyroid carcinoma or MEN2', dq: HIST },
        { l: 'Pancreatitis', dq: HIST },
        { l: NONE, x: true },
      ],
    },
    {
      id: 'pregnancy',
      q: 'Are you pregnant, breastfeeding, or planning a pregnancy in the next 6 months?',
      type: 'single',
      options: [
        { l: 'Yes', dq: "GLP-1 medicines can't be used during pregnancy or breastfeeding, or in the months before trying to conceive." },
        { l: 'No' },
      ],
    },
    {
      id: 'gi_disorders',
      q: 'Do you have a severe gut condition, such as gastroparesis or IBD?',
      type: 'single',
      options: [
        { l: 'Yes', dq: "GLP-1 medicines can worsen severe gastrointestinal conditions, so we can't prescribe them online." },
        { l: 'No' },
      ],
    },
  ],

  // Mirrors TRT_ELIGIBILITY in backend/src/questionnaires/definitions.ts: the
  // backend's "critical" flags are disqualifiers here, "warning" flags are not.
  // Clinical wording - have a clinician review before go-live.
  TRT: [
    {
      id: 'age',
      q: 'What is your age?',
      type: 'single',
      options: [
        { l: 'Under 18', dq: 'TRT through our service is only available to adults aged 18 to 65.' },
        { l: '18 to 39' },
        { l: '40 to 54' },
        { l: '55 to 65' },
        { l: 'Over 65', dq: 'TRT through our service is only available to adults aged 18 to 65. Your own doctor can advise on options after 65.' },
      ],
    },
    {
      id: 'symptoms',
      q: 'Which symptoms are you experiencing?',
      help: 'Select all that apply.',
      type: 'multi',
      options: [
        { l: 'Low energy or fatigue' },
        { l: 'Low libido' },
        { l: 'Erectile dysfunction' },
        { l: 'Loss of muscle mass or strength' },
        { l: 'Low mood or irritability' },
        { l: NONE, x: true, dq: "TRT is prescribed to treat the symptoms of low testosterone, so it isn't the right treatment if you're not experiencing any." },
      ],
    },
    {
      id: 'medical_history',
      q: 'Have you ever had any of the following?',
      help: 'Select all that apply.',
      type: 'multi',
      options: [
        { l: 'Prostate cancer', dq: HIST },
        { l: 'Breast cancer', dq: HIST },
        { l: 'Polycythemia (high red blood cell count)' },
        { l: 'Sleep apnea' },
        { l: NONE, x: true },
      ],
    },
    {
      id: 'trying_to_conceive',
      q: 'Are you trying to have a child in the next 12 months?',
      help: 'Testosterone treatment can reduce fertility. Your doctor will talk this through with you.',
      type: 'single',
      options: [{ l: 'Yes' }, { l: 'No' }],
    },
    {
      id: 'recent_cvd',
      q: 'Have you had a stroke or heart attack in the past 6 months?',
      type: 'single',
      options: [
        { l: 'Yes', dq: 'Based on your medical history, it would not be safe for us to prescribe TRT online right now.' },
        { l: 'No' },
      ],
    },
  ],
};
