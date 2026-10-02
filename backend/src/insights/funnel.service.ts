import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const FUNNEL_STAGES = [
  'QUIZ_COMPLETED',
  'PAID',
  'ACCOUNT_ACTIVATED',
  'CONSULTATION_SUBMITTED',
  'DOCTOR_APPROVED',
  'FIRST_SHIPMENT',
] as const;
export type FunnelStageKey = (typeof FUNNEL_STAGES)[number];

export interface FunnelStage {
  key: FunnelStageKey;
  count: number;
  /** Of the stage before it, as a percentage (null for the first stage or when the previous is 0). */
  percentOfPrevious: number | null;
  /** Of the people who started, as a percentage. */
  percentOfFirst: number | null;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : null);

/** Turns the raw counts into stages with their conversion percentages. */
export function toStages(counts: Record<FunnelStageKey, number>): FunnelStage[] {
  return FUNNEL_STAGES.map((key, i) => ({
    key,
    count: counts[key],
    percentOfPrevious: i === 0 ? null : pct(counts[key], counts[FUNNEL_STAGES[i - 1]]),
    percentOfFirst: i === 0 ? null : pct(counts[key], counts[FUNNEL_STAGES[0]]),
  }));
}

/**
 * Follows the people who completed the eligibility quiz in the last N days through to their first shipment.
 * Patients pay when they check out, *before* a doctor reviews them (a declined patient is refunded) —
 * so payment comes ahead of approval here. Website visitors who never finish the quiz aren't recorded in the
 * database, so the funnel starts at the quiz.
 */
@Injectable()
export class FunnelService {
  constructor(private prisma: PrismaService) {}

  async funnel(periodDays: number, now = new Date()): Promise<{ periodDays: number; stages: FunnelStage[] }> {
    const since = new Date(now.getTime() - periodDays * 86_400_000);
    const inPeriod: Prisma.LeadWhereInput = { createdAt: { gte: since } };
    const count = (extra: Prisma.LeadWhereInput) => this.prisma.lead.count({ where: { ...inPeriod, ...extra } });

    // Each stage only counts people who also passed the stage before it, so the bars can only shrink.
    const paidWhere: Prisma.LeadWhereInput = { convertedAt: { not: null } };
    const activatedWhere: Prisma.LeadWhereInput = { ...paidWhere, patient: { activatedAt: { not: null } } };
    const [quiz, paid, activated, submitted, approved, shipped] = await Promise.all([
      count({}),
      count(paidWhere),
      count(activatedWhere),
      count({ ...paidWhere, patient: { activatedAt: { not: null }, consultations: { some: {} } } }),
      count({ ...paidWhere, patient: { activatedAt: { not: null }, consultations: { some: { status: 'APPROVED' } } } }),
      count({
        ...paidWhere,
        patient: {
          activatedAt: { not: null },
          consultations: { some: { status: 'APPROVED' } },
          orders: { some: { status: { in: ['DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'] } } },
        },
      }),
    ]);

    return {
      periodDays,
      stages: toStages({
        QUIZ_COMPLETED: quiz,
        PAID: paid,
        ACCOUNT_ACTIVATED: activated,
        CONSULTATION_SUBMITTED: submitted,
        DOCTOR_APPROVED: approved,
        FIRST_SHIPMENT: shipped,
      }),
    };
  }
}
