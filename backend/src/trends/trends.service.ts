import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInStatus, DoseStatus } from '../common/enums';
import { TrendPointModel } from './models/trend-point.model';
import { AdherenceWeekModel } from './models/adherence-week.model';

type StoredAnswer = { questionId: string; value?: string | null };

/**
 * Read-side aggregation over CheckIn and DoseEvent history, shaped for a
 * chart rather than a single record — e.g. weight over time from GLP-1
 * check-ins, or dose adherence by week. No UI consumes this yet.
 */
@Injectable()
export class TrendsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Pulls one numeric answer (e.g. weight_kg) out of every completed
   * check-in for a patient, oldest first. Kind-agnostic: works for any
   * questionnaire that asks a numeric question under this id.
   */
  async checkInAnswerTrend(patientId: string, questionId: string): Promise<TrendPointModel[]> {
    const checkIns = await this.prisma.checkIn.findMany({
      where: { patientId, status: CheckInStatus.COMPLETED, completedAt: { not: null } },
      orderBy: { completedAt: 'asc' },
    });

    const points: TrendPointModel[] = [];
    for (const checkIn of checkIns) {
      const answers = (checkIn.answers as StoredAnswer[] | null) ?? [];
      const answer = answers.find((a) => a.questionId === questionId);
      const value = answer?.value != null ? Number(answer.value) : NaN;
      if (Number.isNaN(value)) continue;
      points.push({ checkInId: checkIn.id, date: checkIn.completedAt!, value });
    }
    return points;
  }

  /** Adherence to scheduled doses, bucketed by the Monday-aligned week they were due. */
  async doseAdherenceTrend(patientId: string, weeks = 12): Promise<AdherenceWeekModel[]> {
    const since = new Date(Date.now() - weeks * 7 * 86_400_000);
    const events = await this.prisma.doseEvent.findMany({
      where: { patientId, scheduledFor: { gte: since }, status: { not: DoseStatus.SCHEDULED } },
      orderBy: { scheduledFor: 'asc' },
    });

    const buckets = new Map<string, { weekStart: Date; taken: number; missed: number; skipped: number }>();
    for (const event of events) {
      const start = weekStartOf(event.scheduledFor);
      const key = start.toISOString();
      if (!buckets.has(key)) buckets.set(key, { weekStart: start, taken: 0, missed: 0, skipped: 0 });
      const bucket = buckets.get(key)!;
      if (event.status === DoseStatus.TAKEN) bucket.taken++;
      else if (event.status === DoseStatus.MISSED) bucket.missed++;
      else if (event.status === DoseStatus.SKIPPED) bucket.skipped++;
    }

    return [...buckets.values()]
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
      .map((bucket) => {
        const total = bucket.taken + bucket.missed + bucket.skipped;
        return { ...bucket, adherencePct: total ? Math.round((bucket.taken / total) * 1000) / 10 : 0 };
      });
  }
}

function weekStartOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}
