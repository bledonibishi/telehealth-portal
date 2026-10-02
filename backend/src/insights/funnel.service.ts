import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultationKind, RiskTag } from '../common/enums';
import { triageEligibility } from '../questionnaires/triage';
import { VisitorsService } from './visitors.service';

export const FUNNEL_STAGES = [
  'LANDING_VISITORS',
  'QUIZ_STARTED',
  'PASSED_ELIGIBILITY',
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

/**
 * Turns the raw counts into stages with their conversion percentages. Stages without a count
 * (the website ones, when PostHog isn't connected) are left out, and the percentages are
 * measured from the first stage that is there.
 */
export function toStages(counts: Partial<Record<FunnelStageKey, number>>): FunnelStage[] {
  const present = FUNNEL_STAGES.filter((key) => counts[key] !== undefined);
  const first = present[0];
  return present.map((key, i) => ({
    key,
    count: counts[key]!,
    percentOfPrevious: i === 0 ? null : pct(counts[key]!, counts[present[i - 1]]!),
    percentOfFirst: i === 0 ? null : pct(counts[key]!, counts[first]!),
  }));
}

/**
 * Follows visitors from the landing page to their first shipment. Patients pay when they check out,
 * *before* a doctor reviews them (a declined patient is refunded) — so payment comes ahead of approval.
 *
 * The first two stages (landing page visitors, people who started the quiz) come from PostHog, since
 * the database only learns about someone when they finish the quiz and leave their details; they are
 * left out when PostHog isn't connected. "Passed eligibility" is every lead the eligibility triage
 * didn't mark RED. Visitors and quiz starts are people PostHog saw, leads are people we saved, so a
 * blocked tracker could make the website figures too low — the quiz-start count is never allowed to
 * be lower than the number of leads who finished the quiz.
 */
@Injectable()
export class FunnelService {
  constructor(
    private prisma: PrismaService,
    private visitors: VisitorsService,
  ) {}

  async funnel(
    periodDays: number,
    now = new Date(),
  ): Promise<{ periodDays: number; stages: FunnelStage[]; visitorsConfigured: boolean; visitorsError: string | null }> {
    const since = new Date(now.getTime() - periodDays * 86_400_000);
    const inPeriod: Prisma.LeadWhereInput = { createdAt: { gte: since } };

    // Everyone after the quiz is counted among those who passed it; RED leads are set aside first.
    const leads = await this.prisma.lead.findMany({ where: inPeriod, select: { id: true, productKind: true, quizAnswers: true } });
    const redIds = leads
      .filter((l) => triageEligibility(l.productKind as ConsultationKind, l.quizAnswers as any).riskTag === RiskTag.RED)
      .map((l) => l.id);
    const passedQuiz: Prisma.LeadWhereInput = { ...inPeriod, id: { notIn: redIds } };
    const count = (extra: Prisma.LeadWhereInput) => this.prisma.lead.count({ where: { ...passedQuiz, ...extra } });

    // Each stage only counts people who also passed the stage before it, so the bars can only shrink.
    const paidWhere: Prisma.LeadWhereInput = { convertedAt: { not: null } };
    const activatedWhere: Prisma.LeadWhereInput = { ...paidWhere, patient: { activatedAt: { not: null } } };
    const [paid, activated, submitted, approved, shipped, top] = await Promise.all([
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
      this.visitors.topOfFunnel(periodDays, now.getTime()),
    ]);

    const eligible = leads.length - redIds.length;
    const started = top.data ? Math.max(top.data.quizStarted, leads.length) : undefined;
    return {
      periodDays,
      visitorsConfigured: top.configured,
      visitorsError: top.error,
      stages: toStages({
        LANDING_VISITORS: top.data && started !== undefined ? Math.max(top.data.visitors, started) : undefined,
        QUIZ_STARTED: started,
        PASSED_ELIGIBILITY: eligible,
        PAID: paid,
        ACCOUNT_ACTIVATED: activated,
        CONSULTATION_SUBMITTED: submitted,
        DOCTOR_APPROVED: approved,
        FIRST_SHIPMENT: shipped,
      }),
    };
  }
}
