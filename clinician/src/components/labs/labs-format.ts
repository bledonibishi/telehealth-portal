export const KIND_LABEL: Record<string, string> = {
  ESTRADIOL: 'Estradiol',
  TESTOSTERONE: 'Testosterone',
  FSH: 'FSH',
  LH: 'LH',
  SHBG: 'SHBG',
  PSA: 'PSA',
  HEMATOCRIT: 'Haematocrit',
  LIPID_PANEL: 'Lipid panel',
  HBA1C: 'HbA1c',
  LIVER_FUNCTION: 'Liver function',
  OTHER: 'Other',
};

// Sensible defaults for the entry form; the lab's own report always wins.
export const DEFAULT_UNIT: Record<string, string> = {
  TESTOSTERONE: 'nmol/L',
  HEMATOCRIT: '%',
  PSA: 'ng/mL',
  ESTRADIOL: 'pmol/L',
  HBA1C: 'mmol/mol',
};

export type TrtMonitoring = {
  patientId: string;
  startedAt: string;
  refillsOnHold: boolean;
  holdReasons: string[];
  warnings: string[];
  labs: { kind: string; dueAt: string; overdue: boolean; lastValue?: number | null; lastUnit?: string | null; lastCollectedAt?: string | null }[];
};
