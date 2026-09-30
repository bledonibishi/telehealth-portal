import { ConsultationKind, RedFlagSeverity } from '../common/enums';

// Questionnaires are clinical content: change them through code review, and
// bump `version` whenever a question, option or flag changes meaning, so each
// consultation records exactly which wording the patient answered.

export type QuestionType = 'single' | 'multi' | 'number' | 'text';
export type QuestionnaireStage = 'ELIGIBILITY' | 'INTAKE' | 'CHECKIN';

export interface Flag {
  severity: RedFlagSeverity;
  description: string;
}

export interface Option {
  value: string;
  label: string;
  // Clears (and is cleared by) every other option in a multi-select.
  exclusive?: boolean;
  flag?: Flag;
}

export interface Question {
  id: string;
  text: string;
  help?: string;
  type: QuestionType;
  optional?: boolean;
  options?: Option[];
  min?: number;
  max?: number;
  unit?: string;
  // Asked only when an earlier single/multi question has one of these values.
  showIf?: { questionId: string; anyOf: string[] };
}

export interface Derived {
  answers: Array<{ questionId: string; question: string; answer: string; value: string }>;
  flags: Flag[];
}

export interface Questionnaire {
  kind: ConsultationKind;
  stage: QuestionnaireStage;
  version: number;
  title: string;
  questions: Question[];
  // Values computed from the answers (e.g. BMI) and the flags they raise.
  derive?: (values: Record<string, string>) => Derived;
}

const critical = (description: string): Flag => ({ severity: RedFlagSeverity.CRITICAL, description });
const warning = (description: string): Flag => ({ severity: RedFlagSeverity.WARNING, description });
const yesNo = (yesFlag?: Flag): Option[] => [
  { value: 'yes', label: 'Yes', flag: yesFlag },
  { value: 'no', label: 'No' },
];

// ── Eligibility ─────────────────────────────────────────────────────────────
// Mirrors the live Webflow quiz (website/webflow/live-site-scripts-embed.html):
// same question ids and option labels, because that embed sends labels, not
// values. The embed screens people out client-side; these flags re-check the
// same answers server-side when the consultation is created.
const NONE = 'None of the above';

const HRT_ELIGIBILITY: Questionnaire = {
  kind: ConsultationKind.HRT,
  stage: 'ELIGIBILITY',
  version: 1,
  title: 'HRT eligibility',
  questions: [
    {
      id: 'age',
      text: 'What is your age?',
      type: 'single',
      options: [
        { value: 'under_18', label: 'Under 18', flag: critical('Under 18 — outside the 18–65 HRT age range') },
        { value: '18_39', label: '18 to 39', flag: warning('Aged under 40 — consider premature ovarian insufficiency work-up') },
        { value: '40_54', label: '40 to 54' },
        { value: '55_65', label: '55 to 65' },
        { value: 'over_65', label: 'Over 65', flag: critical('Over 65 — outside the 18–65 HRT age range') },
      ],
    },
    {
      id: 'symptoms',
      text: 'Which symptoms are you experiencing?',
      type: 'multi',
      options: [
        { value: 'vasomotor', label: 'Hot flushes or night sweats' },
        { value: 'mood', label: 'Mood changes or anxiety' },
        { value: 'brain_fog', label: 'Brain fog' },
        { value: 'libido', label: 'Low libido' },
        { value: 'sleep', label: 'Sleep disturbances' },
        { value: 'joint_pain', label: 'Joint or muscle pain' },
        { value: 'none', label: NONE, exclusive: true, flag: critical('No menopausal symptoms reported') },
      ],
    },
    {
      id: 'medical_history',
      text: 'Have you ever had any of the following?',
      type: 'multi',
      options: [
        { value: 'breast_cancer', label: 'Breast cancer', flag: critical('History of breast cancer') },
        { value: 'vte', label: 'Blood clots (DVT or PE)', flag: critical('History of blood clots (DVT/PE)') },
        { value: 'recent_cvd', label: 'Stroke or heart attack in the past 12 months', flag: critical('Stroke or heart attack in the past 12 months') },
        { value: 'bleeding', label: 'Unexplained vaginal bleeding', flag: critical('Unexplained vaginal bleeding') },
        { value: 'none', label: NONE, exclusive: true },
      ],
    },
    {
      id: 'pregnancy',
      text: 'Are you currently pregnant?',
      type: 'single',
      options: yesNo(critical('Currently pregnant')),
    },
    {
      id: 'blood_pressure',
      text: 'Do you have uncontrolled high blood pressure (above 160/100)?',
      type: 'single',
      options: yesNo(critical('Uncontrolled high blood pressure (>160/100)')),
    },
  ],
};

const GLP1_ELIGIBILITY: Questionnaire = {
  kind: ConsultationKind.GLP1,
  stage: 'ELIGIBILITY',
  version: 1,
  title: 'GLP-1 eligibility',
  questions: [
    {
      id: 'age',
      text: 'What is your age?',
      type: 'single',
      options: [
        { value: 'under_18', label: 'Under 18', flag: critical('Under 18 — outside the 18–75 GLP-1 age range') },
        { value: '18_39', label: '18 to 39' },
        { value: '40_59', label: '40 to 59' },
        { value: '60_75', label: '60 to 75' },
        { value: 'over_75', label: 'Over 75', flag: critical('Over 75 — outside the 18–75 GLP-1 age range') },
      ],
    },
    {
      id: 'bmi',
      text: 'What is your BMI?',
      type: 'single',
      options: [
        { value: '30_plus', label: '30 or above' },
        { value: '27_29', label: '27 to 29.9' },
        { value: 'under_27', label: 'Under 27', flag: critical('Self-reported BMI under 27') },
        { value: 'unknown', label: 'I don’t know' },
      ],
    },
    {
      id: 'weight_conditions',
      text: 'Do you have either of these conditions?',
      type: 'multi',
      showIf: { questionId: 'bmi', anyOf: ['27_29'] },
      options: [
        { value: 'diabetes', label: 'Type 2 diabetes or prediabetes' },
        { value: 'hypertension', label: 'High blood pressure' },
        { value: 'neither', label: 'Neither of these', exclusive: true, flag: critical('BMI 27–29.9 without a weight-related condition') },
      ],
    },
    {
      id: 'medical_history',
      text: 'Have you ever had any of the following?',
      type: 'multi',
      options: [
        { value: 't1dm', label: 'Type 1 diabetes', flag: critical('Type 1 diabetes') },
        { value: 'mtc_men2', label: 'Medullary thyroid carcinoma or MEN2', flag: critical('Medullary thyroid carcinoma or MEN2') },
        { value: 'pancreatitis', label: 'Pancreatitis', flag: critical('History of pancreatitis') },
        { value: 'none', label: NONE, exclusive: true },
      ],
    },
    {
      id: 'pregnancy',
      text: 'Are you pregnant, breastfeeding, or planning a pregnancy in the next 6 months?',
      type: 'single',
      options: yesNo(critical('Pregnant, breastfeeding or planning pregnancy within 6 months')),
    },
    {
      id: 'gi_disorders',
      text: 'Do you have a severe gut condition, such as gastroparesis or IBD?',
      type: 'single',
      options: yesNo(critical('Severe gastrointestinal disease (gastroparesis/IBD)')),
    },
  ],
};

const TRT_ELIGIBILITY: Questionnaire = {
  kind: ConsultationKind.TRT,
  stage: 'ELIGIBILITY',
  version: 1,
  title: 'TRT eligibility',
  questions: [
    {
      id: 'age',
      text: 'What is your age?',
      type: 'single',
      options: [
        { value: 'under_18', label: 'Under 18', flag: critical('Under 18 — outside the 18–65 TRT age range') },
        { value: '18_39', label: '18 to 39' },
        { value: '40_54', label: '40 to 54' },
        { value: '55_65', label: '55 to 65' },
        { value: 'over_65', label: 'Over 65', flag: critical('Over 65 — outside the 18–65 TRT age range') },
      ],
    },
    {
      id: 'symptoms',
      text: 'Which symptoms are you experiencing?',
      type: 'multi',
      options: [
        { value: 'low_energy', label: 'Low energy or fatigue' },
        { value: 'low_libido', label: 'Low libido' },
        { value: 'erectile_dysfunction', label: 'Erectile dysfunction' },
        { value: 'muscle_loss', label: 'Loss of muscle mass or strength' },
        { value: 'mood', label: 'Low mood or irritability' },
        { value: 'none', label: NONE, exclusive: true, flag: critical('No low-testosterone symptoms reported') },
      ],
    },
    {
      id: 'medical_history',
      text: 'Have you ever had any of the following?',
      type: 'multi',
      options: [
        { value: 'prostate_cancer', label: 'Prostate cancer', flag: critical('History of prostate cancer') },
        { value: 'breast_cancer', label: 'Breast cancer', flag: critical('History of breast cancer') },
        { value: 'polycythemia', label: 'Polycythemia (high red blood cell count)', flag: warning('History of polycythemia — needs monitoring on TRT') },
        { value: 'sleep_apnea', label: 'Sleep apnea', flag: warning('Sleep apnea — testosterone can worsen it') },
        { value: 'none', label: NONE, exclusive: true },
      ],
    },
    {
      id: 'trying_to_conceive',
      text: 'Are you trying to have a child in the next 12 months?',
      type: 'single',
      options: yesNo(warning('Trying to conceive — testosterone suppresses fertility')),
    },
    {
      id: 'recent_cvd',
      text: 'Have you had a stroke or heart attack in the past 6 months?',
      type: 'single',
      options: yesNo(critical('Stroke or heart attack in the past 6 months')),
    },
  ],
};

// ── Medical intake ──────────────────────────────────────────────────────────
// Answered after payment, in the patient portal. What a prescriber needs that
// the short eligibility screen doesn't ask. Ids must not collide with the
// eligibility ids of the same kind — both sets are stored on the consultation.

const COMMON_INTAKE: Question[] = [
  { id: 'height_cm', text: 'What is your height?', type: 'number', unit: 'cm', min: 120, max: 230 },
  { id: 'weight_kg', text: 'What is your current weight?', type: 'number', unit: 'kg', min: 30, max: 300 },
  {
    id: 'bp_known',
    text: 'Do you know your blood pressure from a reading in the last 6 months?',
    type: 'single',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No', flag: warning('No blood pressure reading in the last 6 months') },
    ],
  },
  { id: 'bp_systolic', text: 'Top number (systolic)', type: 'number', unit: 'mmHg', min: 70, max: 250, showIf: { questionId: 'bp_known', anyOf: ['yes'] } },
  { id: 'bp_diastolic', text: 'Bottom number (diastolic)', type: 'number', unit: 'mmHg', min: 40, max: 150, showIf: { questionId: 'bp_known', anyOf: ['yes'] } },
  {
    id: 'smoking',
    text: 'Do you smoke?',
    type: 'single',
    options: [
      { value: 'never', label: 'Never' },
      { value: 'former', label: 'I used to' },
      { value: 'current', label: 'Yes, currently', flag: warning('Current smoker') },
    ],
  },
  {
    id: 'current_medications',
    text: 'Which medicines, supplements or remedies do you take?',
    help: 'Include the dose if you know it. Write “None” if you take nothing.',
    type: 'text',
  },
  { id: 'allergies', text: 'Do you have any allergies to medicines?', help: 'Write “None” if you have none.', type: 'text' },
  { id: 'other_conditions', text: 'Any other medical conditions we should know about?', type: 'text', optional: true },
  {
    id: 'gp_details',
    text: 'Your doctor’s name and practice',
    help: 'So we can let them know about your treatment.',
    type: 'text',
    optional: true,
  },
];

function bmiOf(values: Record<string, string>): number | null {
  const h = Number(values.height_cm) / 100;
  const w = Number(values.weight_kg);
  if (!h || !w) return null;
  return Math.round((w / (h * h)) * 10) / 10;
}

function deriveVitals(kind: ConsultationKind) {
  return (values: Record<string, string>): Derived => {
    const derived: Derived = { answers: [], flags: [] };
    const bmi = bmiOf(values);
    if (bmi !== null) {
      derived.answers.push({ questionId: 'bmi_calculated', question: 'BMI (calculated from height and weight)', answer: String(bmi), value: String(bmi) });
      if (kind === ConsultationKind.GLP1 && bmi < 27) derived.flags.push(critical(`Calculated BMI ${bmi} is below 27`));
      else if (kind === ConsultationKind.GLP1 && bmi < 30) derived.flags.push(warning(`Calculated BMI ${bmi} — needs a weight-related condition (27–29.9)`));
      else if (kind === ConsultationKind.HRT && bmi >= 30) derived.flags.push(warning(`BMI ${bmi} — raised VTE risk, prefer transdermal estrogen`));
    }

    const sys = Number(values.bp_systolic);
    const dia = Number(values.bp_diastolic);
    if (sys && dia) {
      if (sys >= 160 || dia >= 100) {
        const reading = `Blood pressure ${sys}/${dia}`;
        // Uncontrolled BP compounds the cardiovascular risk of both hormone
        // programmes (VTE on HRT, polycythemia/erythrocytosis on TRT).
        const hrtOrTrt = kind === ConsultationKind.HRT || kind === ConsultationKind.TRT;
        derived.flags.push(hrtOrTrt ? critical(`${reading} — uncontrolled hypertension`) : warning(`${reading} — uncontrolled hypertension`));
      } else if (sys >= 140 || dia >= 90) {
        derived.flags.push(warning(`Blood pressure ${sys}/${dia} — raised`));
      }
    }
    return derived;
  };
}

const HRT_INTAKE: Questionnaire = {
  kind: ConsultationKind.HRT,
  stage: 'INTAKE',
  version: 1,
  title: 'HRT medical questionnaire',
  derive: deriveVitals(ConsultationKind.HRT),
  questions: [
    ...COMMON_INTAKE,
    {
      // Read by the prescribing rules: estrogen alone needs a progestogen unless 'no'.
      id: 'has_uterus',
      text: 'Do you still have your womb (uterus)?',
      type: 'single',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No — I’ve had a hysterectomy' },
        { value: 'unsure', label: 'I’m not sure', flag: warning('Unsure whether uterus is present — confirm before estrogen-only HRT') },
      ],
    },
    {
      id: 'last_period',
      text: 'When was your last period?',
      type: 'single',
      options: [
        { value: 'within_12m', label: 'Within the last 12 months' },
        { value: '1_2y', label: '1 to 2 years ago' },
        { value: 'over_2y', label: 'More than 2 years ago' },
        { value: 'surgical', label: 'I don’t have periods because of surgery or treatment' },
      ],
    },
    {
      id: 'postmenopausal_bleeding',
      text: 'Have you had any bleeding more than 12 months after your last period?',
      type: 'single',
      showIf: { questionId: 'last_period', anyOf: ['over_2y'] },
      options: yesNo(critical('Postmenopausal bleeding — needs investigation before HRT')),
    },
    { id: 'current_hrt', text: 'Are you using any HRT at the moment?', type: 'single', options: yesNo() },
    {
      id: 'current_hrt_details',
      text: 'Which HRT, and what dose?',
      type: 'text',
      showIf: { questionId: 'current_hrt', anyOf: ['yes'] },
    },
    {
      id: 'migraine_aura',
      text: 'Do you get migraines with aura (visual disturbance before the headache)?',
      type: 'single',
      options: yesNo(warning('Migraine with aura — prefer transdermal estrogen')),
    },
    {
      id: 'liver_disease',
      text: 'Do you have liver disease?',
      type: 'single',
      options: yesNo(critical('Liver disease reported')),
    },
    {
      id: 'family_vte',
      text: 'Has a parent, brother or sister had a blood clot before age 60?',
      type: 'single',
      options: yesNo(warning('Family history of VTE under 60 — prefer transdermal estrogen')),
    },
    {
      id: 'family_breast_cancer',
      text: 'Has a close relative had breast or ovarian cancer?',
      type: 'single',
      options: yesNo(warning('Family history of breast/ovarian cancer')),
    },
  ],
};

const GLP1_INTAKE: Questionnaire = {
  kind: ConsultationKind.GLP1,
  stage: 'INTAKE',
  version: 1,
  title: 'Weight management medical questionnaire',
  derive: deriveVitals(ConsultationKind.GLP1),
  questions: [
    ...COMMON_INTAKE,
    {
      id: 'glp1_prior_use',
      text: 'Have you used a GLP-1 weight-loss medicine before (e.g. Wegovy, Ozempic, Mounjaro)?',
      type: 'single',
      options: yesNo(),
    },
    {
      id: 'glp1_prior_details',
      text: 'Which medicine, what dose, and when did you last inject?',
      help: 'You’ll upload proof in the next step. Without it, treatment restarts on the lowest dose.',
      type: 'text',
      showIf: { questionId: 'glp1_prior_use', anyOf: ['yes'] },
    },
    {
      id: 'diabetes_medicines',
      text: 'Do you take any of these diabetes medicines?',
      type: 'multi',
      options: [
        { value: 'insulin', label: 'Insulin', flag: warning('On insulin — hypoglycaemia risk with GLP-1') },
        { value: 'sulfonylurea', label: 'Gliclazide, glimepiride or another sulfonylurea', flag: warning('On a sulfonylurea — hypoglycaemia risk with GLP-1') },
        { value: 'metformin', label: 'Metformin' },
        { value: 'none', label: 'None of these', exclusive: true },
      ],
    },
    {
      id: 'eating_disorder',
      text: 'Have you ever had an eating disorder (such as anorexia or bulimia)?',
      type: 'single',
      options: yesNo(critical('History of eating disorder')),
    },
    {
      id: 'gallbladder',
      text: 'Have you had gallstones or gallbladder problems?',
      type: 'single',
      options: yesNo(warning('Gallbladder disease history')),
    },
    {
      id: 'kidney_disease',
      text: 'Do you have kidney disease?',
      type: 'single',
      options: yesNo(warning('Kidney disease — monitor for dehydration with GI side effects')),
    },
    {
      id: 'bariatric_surgery',
      text: 'Have you had weight-loss surgery?',
      type: 'single',
      options: yesNo(warning('Previous bariatric surgery')),
    },
    {
      id: 'diabetic_retinopathy',
      text: 'Do you have diabetic eye disease (retinopathy)?',
      type: 'single',
      showIf: { questionId: 'diabetes_medicines', anyOf: ['insulin', 'sulfonylurea', 'metformin'] },
      options: yesNo(warning('Diabetic retinopathy — rapid glucose improvement can worsen it')),
    },
  ],
};

const TRT_INTAKE: Questionnaire = {
  kind: ConsultationKind.TRT,
  stage: 'INTAKE',
  version: 1,
  title: 'TRT medical questionnaire',
  derive: deriveVitals(ConsultationKind.TRT),
  questions: [
    ...COMMON_INTAKE,
    { id: 'prior_trt_use', text: 'Are you currently using testosterone, or have you used it before?', type: 'single', options: yesNo() },
    {
      id: 'prior_trt_details',
      text: 'Which product, what dose, and when did you last use it?',
      type: 'text',
      showIf: { questionId: 'prior_trt_use', anyOf: ['yes'] },
    },
    {
      // Read by the prescribing rules: an absolute contraindication to testosterone.
      id: 'prostate_cancer_history',
      text: 'Have you ever been diagnosed with prostate cancer?',
      type: 'single',
      options: yesNo(critical('History of prostate cancer — contraindication to testosterone')),
    },
    {
      id: 'breast_cancer_history',
      text: 'Have you ever been diagnosed with breast cancer?',
      type: 'single',
      options: yesNo(critical('History of breast cancer — contraindication to testosterone')),
    },
    {
      id: 'sleep_apnea',
      text: 'Do you have sleep apnea?',
      type: 'single',
      options: yesNo(warning('Sleep apnea — testosterone can worsen it')),
    },
    // trying_to_conceive is already asked at ELIGIBILITY — not repeated here,
    // so there's one fertility answer per consultation, not two.
    {
      id: 'urinary_symptoms',
      text: 'Do you have trouble urinating, a weak stream, or urinate frequently at night?',
      type: 'single',
      options: yesNo(warning('Urinary symptoms — assess prostate before starting testosterone')),
    },
    {
      // Read by the prescribing rules: TRT shouldn't start on symptoms alone.
      id: 'baseline_diagnosis',
      text: 'Has a doctor confirmed low testosterone with a blood test, or do you have a diagnosed condition that causes it (e.g. hypogonadism)?',
      help: 'If not, we can arrange blood tests before starting treatment.',
      type: 'single',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No', flag: warning('No confirmed baseline diagnosis of low testosterone on file') },
      ],
    },
  ],
};

// ── Monthly check-in ────────────────────────────────────────────────────────
// Answered each month before the next supply; a doctor reviews it and decides
// whether to repeat, change the dose, hold or stop.

const URGENT = 'If this is severe or getting worse, don’t wait for us — call 112 or go to your nearest emergency department.';

const COMMON_CHECKIN_END: Question[] = [
  {
    id: 'new_medicines',
    text: 'Have you started any new medicines, or been diagnosed with anything new, since your last check-in?',
    type: 'single',
    options: yesNo(warning('New medicines or diagnoses since last check-in')),
  },
  { id: 'new_medicines_details', text: 'Please tell us what', type: 'text', showIf: { questionId: 'new_medicines', anyOf: ['yes'] } },
  { id: 'notes', text: 'Anything else you’d like your clinician to know?', type: 'text', optional: true },
];

const GLP1_CHECKIN: Questionnaire = {
  kind: ConsultationKind.GLP1,
  stage: 'CHECKIN',
  version: 1,
  title: 'Monthly check-in',
  questions: [
    { id: 'weight_kg', text: 'What is your weight today?', type: 'number', unit: 'kg', min: 30, max: 300 },
    {
      id: 'doses_missed',
      text: 'How many weekly doses did you miss in the last month?',
      type: 'single',
      options: [
        { value: '0', label: 'None' },
        { value: '1', label: 'One' },
        { value: '2_plus', label: 'Two or more', flag: warning('Missed 2+ doses — consider not stepping up the dose') },
      ],
    },
    {
      id: 'side_effects',
      text: 'Which side effects have you had?',
      type: 'multi',
      options: [
        { value: 'nausea', label: 'Nausea' },
        { value: 'vomiting', label: 'Vomiting', flag: warning('Vomiting reported') },
        { value: 'diarrhoea', label: 'Diarrhoea' },
        { value: 'constipation', label: 'Constipation' },
        { value: 'reflux', label: 'Heartburn or reflux' },
        { value: 'fatigue', label: 'Tiredness' },
        { value: 'none', label: 'None', exclusive: true },
      ],
    },
    {
      id: 'side_effect_impact',
      text: 'How much do the side effects affect your day?',
      type: 'single',
      showIf: { questionId: 'side_effects', anyOf: ['nausea', 'vomiting', 'diarrhoea', 'constipation', 'reflux', 'fatigue'] },
      options: [
        { value: 'mild', label: 'Barely — they’re mild' },
        { value: 'moderate', label: 'Somewhat, but I manage' },
        { value: 'severe', label: 'A lot — I struggle with daily activities', flag: warning('Severe side effects — consider holding the dose') },
      ],
    },
    {
      id: 'abdominal_pain',
      text: 'Have you had severe pain in your stomach that spreads to your back, with or without vomiting?',
      help: URGENT,
      type: 'single',
      options: yesNo(critical('Severe abdominal pain radiating to the back — possible pancreatitis')),
    },
    {
      id: 'gallbladder_symptoms',
      text: 'Have you had pain in the upper right of your stomach, a fever, or yellowing of your skin or eyes?',
      help: URGENT,
      type: 'single',
      options: yesNo(critical('Possible gallbladder disease')),
    },
    {
      id: 'pregnancy',
      text: 'Are you pregnant, or planning to become pregnant?',
      type: 'single',
      options: yesNo(critical('Pregnant or planning pregnancy — GLP-1 must be stopped')),
    },
    ...COMMON_CHECKIN_END,
  ],
};

const HRT_CHECKIN: Questionnaire = {
  kind: ConsultationKind.HRT,
  stage: 'CHECKIN',
  version: 1,
  title: 'Monthly check-in',
  questions: [
    {
      id: 'symptom_control',
      text: 'How are your menopause symptoms compared with before treatment?',
      type: 'single',
      options: [
        { value: 'much_better', label: 'Much better' },
        { value: 'better', label: 'A little better' },
        { value: 'same', label: 'No change' },
        { value: 'worse', label: 'Worse', flag: warning('Symptoms worse on treatment') },
      ],
    },
    {
      id: 'side_effects',
      text: 'Which side effects have you had?',
      type: 'multi',
      options: [
        { value: 'breast_tenderness', label: 'Breast tenderness' },
        { value: 'headaches', label: 'Headaches' },
        { value: 'bloating', label: 'Bloating' },
        { value: 'mood', label: 'Mood changes' },
        { value: 'skin_irritation', label: 'Skin irritation where I apply it' },
        { value: 'none', label: 'None', exclusive: true },
      ],
    },
    {
      id: 'bleeding',
      text: 'Have you had any vaginal bleeding you didn’t expect?',
      type: 'single',
      options: yesNo(critical('Unexpected vaginal bleeding on HRT — needs investigation')),
    },
    {
      id: 'vte_symptoms',
      text: 'Have you had a painful, swollen leg, sudden shortness of breath, or chest pain?',
      help: URGENT,
      type: 'single',
      options: yesNo(critical('Possible blood clot symptoms')),
    },
    {
      id: 'breast_changes',
      text: 'Have you noticed a new lump or change in your breasts?',
      type: 'single',
      options: yesNo(critical('New breast lump or change — refer for assessment')),
    },
    { id: 'bp_systolic', text: 'If you’ve had your blood pressure taken this month: top number', type: 'number', unit: 'mmHg', min: 70, max: 250, optional: true },
    { id: 'bp_diastolic', text: 'Bottom number', type: 'number', unit: 'mmHg', min: 40, max: 150, optional: true },
    ...COMMON_CHECKIN_END,
  ],
  derive: (values) => {
    const sys = Number(values.bp_systolic);
    const dia = Number(values.bp_diastolic);
    const flags: Flag[] = [];
    if (sys && dia && (sys >= 160 || dia >= 100)) flags.push(critical(`Blood pressure ${sys}/${dia} — uncontrolled hypertension`));
    else if (sys && dia && (sys >= 140 || dia >= 90)) flags.push(warning(`Blood pressure ${sys}/${dia} — raised`));
    return { answers: [], flags };
  },
};

const TRT_CHECKIN: Questionnaire = {
  kind: ConsultationKind.TRT,
  stage: 'CHECKIN',
  version: 1,
  title: 'Monthly check-in',
  questions: [
    {
      id: 'symptom_control',
      text: 'How are your symptoms compared with before treatment?',
      type: 'single',
      options: [
        { value: 'much_better', label: 'Much better' },
        { value: 'better', label: 'A little better' },
        { value: 'same', label: 'No change' },
        { value: 'worse', label: 'Worse', flag: warning('Symptoms worse on treatment') },
      ],
    },
    {
      id: 'side_effects',
      text: 'Which side effects have you had?',
      type: 'multi',
      options: [
        { value: 'acne', label: 'Acne or oily skin' },
        { value: 'mood', label: 'Mood changes or irritability' },
        { value: 'injection_site', label: 'Injection site pain or swelling' },
        { value: 'breast_tenderness', label: 'Breast tenderness or swelling', flag: warning('Breast tenderness/swelling — check for gynaecomastia') },
        { value: 'fluid_retention', label: 'Fluid retention or swelling in the ankles' },
        { value: 'none', label: 'None', exclusive: true },
      ],
    },
    {
      id: 'polycythemia_symptoms',
      text: 'Have you had headaches, dizziness, visual disturbance, or unusual redness of the face?',
      help: URGENT,
      type: 'single',
      options: yesNo(critical('Possible symptoms of raised red blood cell count (polycythemia)')),
    },
    {
      id: 'urinary_symptoms',
      text: 'Have you had new or worsening urinary symptoms (weak stream, frequency, blood in urine)?',
      type: 'single',
      options: yesNo(warning('Urinary symptoms — assess prostate')),
    },
    {
      id: 'vte_symptoms',
      text: 'Have you had a painful, swollen leg, sudden shortness of breath, or chest pain?',
      help: URGENT,
      type: 'single',
      options: yesNo(critical('Possible blood clot symptoms')),
    },
    { id: 'bp_systolic', text: 'If you’ve had your blood pressure taken this month: top number', type: 'number', unit: 'mmHg', min: 70, max: 250, optional: true },
    { id: 'bp_diastolic', text: 'Bottom number', type: 'number', unit: 'mmHg', min: 40, max: 150, optional: true },
    ...COMMON_CHECKIN_END,
  ],
  derive: (values) => {
    const sys = Number(values.bp_systolic);
    const dia = Number(values.bp_diastolic);
    const flags: Flag[] = [];
    if (sys && dia && (sys >= 160 || dia >= 100)) flags.push(critical(`Blood pressure ${sys}/${dia} — uncontrolled hypertension`));
    else if (sys && dia && (sys >= 140 || dia >= 90)) flags.push(warning(`Blood pressure ${sys}/${dia} — raised`));
    return { answers: [], flags };
  },
};

export const QUESTIONNAIRES: Questionnaire[] = [
  HRT_ELIGIBILITY,
  GLP1_ELIGIBILITY,
  TRT_ELIGIBILITY,
  HRT_INTAKE,
  GLP1_INTAKE,
  TRT_INTAKE,
  HRT_CHECKIN,
  GLP1_CHECKIN,
  TRT_CHECKIN,
];

export function findQuestionnaire(kind: ConsultationKind, stage: QuestionnaireStage): Questionnaire {
  const found = QUESTIONNAIRES.find((q) => q.kind === kind && q.stage === stage);
  if (!found) throw new Error(`No ${stage} questionnaire for ${kind}`);
  return found;
}

export const versionTag = (q: Questionnaire) => `${q.kind}-${q.stage.toLowerCase()}@${q.version}`;
