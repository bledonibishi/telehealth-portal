export interface DecisionRecord {
  clinicianId: string;
  action: 'CONSULTATION_APPROVED' | 'CONSULTATION_DECLINED' | 'CONSULTATION_MORE_INFO_REQUESTED';
  /** Minutes from the patient submitting to this decision; null when the consultation can't be found. */
  minutes: number | null;
}

export interface PerformanceInputs {
  clinicians: Array<{ id: string; firstName: string; lastName: string; email: string; role: string; isVerified: boolean }>;
  decisions: DecisionRecord[];
  prescriptionsIssued: Map<string, number>;
  checkInsReviewed: Map<string, number>;
  openCases: Map<string, number>;
}

export interface ClinicianPerformanceRow {
  clinicianId: string;
  name: string;
  email: string;
  role: string;
  isVerified: boolean;
  /** ACTIVE when they did anything in the period (or hold an open case); INACTIVE otherwise. */
  status: 'ACTIVE' | 'INACTIVE';
  casesDecided: number;
  approved: number;
  declined: number;
  moreInfoRequests: number;
  /** Approvals as a share of approvals + declines. */
  approvalRate: number | null;
  avgDecisionMinutes: number | null;
  medianDecisionMinutes: number | null;
  prescriptionsIssued: number;
  checkInsReviewed: number;
  openCases: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round1(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

export function summarisePerformance(input: PerformanceInputs): ClinicianPerformanceRow[] {
  const rows = input.clinicians.map((c): ClinicianPerformanceRow => {
    const mine = input.decisions.filter((d) => d.clinicianId === c.id);
    const decided = mine.filter((d) => d.action !== 'CONSULTATION_MORE_INFO_REQUESTED');
    const approved = decided.filter((d) => d.action === 'CONSULTATION_APPROVED').length;
    const declined = decided.length - approved;
    const times = decided.map((d) => d.minutes).filter((m): m is number => m !== null && m >= 0);
    const prescriptionsIssued = input.prescriptionsIssued.get(c.id) ?? 0;
    const checkInsReviewed = input.checkInsReviewed.get(c.id) ?? 0;
    const openCases = input.openCases.get(c.id) ?? 0;
    const moreInfoRequests = mine.length - decided.length;
    const active = decided.length + moreInfoRequests + prescriptionsIssued + checkInsReviewed + openCases > 0;

    return {
      clinicianId: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      role: c.role,
      isVerified: c.isVerified,
      status: active ? 'ACTIVE' : 'INACTIVE',
      casesDecided: decided.length,
      approved,
      declined,
      moreInfoRequests,
      approvalRate: decided.length ? round1((approved / decided.length) * 100) : null,
      avgDecisionMinutes: times.length ? round1(times.reduce((a, b) => a + b, 0) / times.length) : null,
      medianDecisionMinutes: median(times),
      prescriptionsIssued,
      checkInsReviewed,
      openCases,
    };
  });
  // Busiest first, then by name.
  return rows.sort((a, b) => b.casesDecided + b.prescriptionsIssued - (a.casesDecided + a.prescriptionsIssued) || a.name.localeCompare(b.name));
}
