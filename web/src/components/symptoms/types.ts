export type SymptomScale = {
  id: 'MRS' | 'AMS';
  name: string;
  intro: string;
  minScore: number;
  maxScore: number;
  options: { score: number; label: string }[];
  domains: { id: string; label: string }[];
  items: { id: string; text: string; domain: string }[];
};

export type DomainScore = { domain: string; label: string; score: number; min: number; max: number };

export type SymptomAssessment = {
  id: string;
  recordedAt: string;
  totalScore: number;
  minScore: number;
  maxScore: number;
  severity: string;
  domainScores: DomainScore[];
  answers: { itemId: string; score: number }[];
};

/** 0 = no symptoms, 1 = the worst the scale allows — lets MRS (0–44) and AMS (17–85) share one display. */
export const burden = (score: number, min: number, max: number) => (max === min ? 0 : (score - min) / (max - min));
