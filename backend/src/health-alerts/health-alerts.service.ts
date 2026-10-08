import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInStatus, ConsultationKind, ConsultationStatus, PrescriptionStatus } from '../common/enums';
import { OPEN_ALERTS_WHERE } from '../side-effects/side-effects';
import { WeightMeasurementsService } from '../weight-journey/weight-measurements.service';
import { CHECK_IN_OVERDUE_AFTER_DAYS, EXPIRING_WITHIN_DAYS, type AlertPatient, type HealthAlert, buildHealthAlerts } from './health-alerts';

/** Every doctor's page asks, and the figures change slowly: share one answer for a short while. */
const CACHE_MS = 30_000;
const DAY = 86_400_000;

const nameOf = (p: { id: string; firstName: string; lastName: string }): AlertPatient => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim() });

@Injectable()
export class HealthAlertsService {
  private cached: { at: number; value: HealthAlert[] } | null = null;

  constructor(
    private prisma: PrismaService,
    private weights: WeightMeasurementsService,
  ) {}

  async alerts(now: Date = new Date()): Promise<HealthAlert[]> {
    if (this.cached && now.getTime() - this.cached.at < CACHE_MS) return this.cached.value;

    const live = { activatedAt: { not: null }, subscriptionEndedAt: null };
    const [patients, severe, pending, overdue, expiring] = await Promise.all([
      this.prisma.patient.findMany({
        where: live,
        select: { id: true, firstName: true, lastName: true, lead: { select: { productKind: true } }, consultations: { orderBy: { submittedAt: 'desc' }, take: 1, select: { kind: true } } },
      }),
      this.prisma.sideEffectReport.findMany({
        where: { ...OPEN_ALERTS_WHERE, severity: 'SEVERE' },
        select: { effects: true, patient: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.consultation.findMany({
        where: { status: { in: [ConsultationStatus.SUBMITTED, ConsultationStatus.IN_REVIEW] } },
        select: { submittedAt: true, patient: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.checkIn.findMany({
        where: { status: { in: [CheckInStatus.SCHEDULED, CheckInStatus.SENT] }, dueAt: { lt: new Date(now.getTime() - CHECK_IN_OVERDUE_AFTER_DAYS * DAY) }, patient: live },
        select: { patient: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.prescription.findMany({
        where: { status: PrescriptionStatus.ACTIVE, validUntil: { gte: now, lte: new Date(now.getTime() + EXPIRING_WITHIN_DAYS * DAY) }, patient: live },
        select: { validUntil: true, patient: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    // Weight trends are only worked out for patients on the weight programme.
    const glp1 = patients.filter((p) => (p.lead?.productKind ?? p.consultations[0]?.kind) === ConsultationKind.GLP1);
    const trends = await this.weights.trendsFor(glp1.map((p) => p.id), now);

    const value = buildHealthAlerts(
      {
        weightTrends: glp1.map((p) => {
          const t = trends.get(p.id)!;
          return { patient: nameOf(p), level: t.level, changePct28Days: t.changePct28Days ?? null, latestKg: t.latestKg ?? null, previousKg: t.previousKg ?? null };
        }),
        severeReports: severe.map((r) => ({ patient: nameOf(r.patient), effects: r.effects })),
        pendingReviews: pending.map((c) => ({ patient: nameOf(c.patient), submittedAt: c.submittedAt })),
        overdueCheckIns: overdue.map((c) => ({ patient: nameOf(c.patient) })),
        expiringPrescriptions: expiring.map((p) => ({ patient: nameOf(p.patient), validUntil: p.validUntil! })),
      },
      now,
    );
    this.cached = { at: now.getTime(), value };
    return value;
  }
}
