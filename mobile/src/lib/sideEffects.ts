/** What a patient can report between check-ins. Same keys as SIDE_EFFECTS in backend/src/side-effects/side-effects.ts. */
export const EFFECTS: [string, string][] = [
  ['nausea', 'Nausea'], ['vomiting', 'Vomiting'], ['abdominal_pain', 'Stomach pain'], ['diarrhoea', 'Diarrhoea'], ['constipation', 'Constipation'], ['reflux', 'Heartburn or reflux'],
  ['fatigue', 'Tiredness'], ['headache', 'Headache'], ['dizziness', 'Dizziness'], ['injection_site', 'Reaction where I inject'], ['allergic_reaction', 'Rash, itching or swelling'], ['other', 'Something else'],
];
export const EFFECT_LABEL: Record<string, string> = Object.fromEntries(EFFECTS);
export const SEVERITIES: [string, string, string][] = [
  ['MILD', 'Mild', 'Noticeable, but I’m managing'],
  ['MODERATE', 'Moderate', 'It’s getting in the way of my day'],
  ['SEVERE', 'Severe', 'I’m struggling'],
];
