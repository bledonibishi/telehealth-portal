import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicianRole } from '../common/enums';
import { summarisePerformance, type ClinicianPerformanceRow, type DecisionRecord } from './clinician-performance';

const DECISION_ACTIONS = ['CONSULTATION_APPROVED', 'CONSULTATION_DECLINED', 'CONSULTATION_MORE_INFO_REQUESTED'] as const;

/**
 * How each doctor is doing over the last N days. Decisions come from the audit log, which records who
 * decided and exactly when; response time is measured from the patient submitting to that decision
 * (so it includes any wait for the patient to answer a request for information).
 */
@Injectable()
export class ClinicianPerformanceService {
  constructor(private prisma: PrismaService) {}

  async report(periodDays: number, now = new Date()): Promise<ClinicianPerformanceRow[]> {
    const since = new Date(now.getTime() - periodDays * 86_400_000);

    const [clinicians, audit, prescriptions, reviews, open] = await Promise.all([
      this.prisma.clinician.findMany({
        where: { role: { in: [ClinicianRole.DOCTOR, ClinicianRole.ADMIN] } },
        select: { id: true, firstName: true, lastName: true, email: true, role: true, isVerified: true },
      }),
      this.prisma.auditLogEntry.findMany({
        where: { action: { in: [...DECISION_ACTIONS] }, timestamp: { gte: since } },
        select: { actorId: true, action: true, resourceId: true, timestamp: true },
      }),
      this.prisma.prescription.groupBy({ by: ['prescriberId'], where: { issuedAt: { gte: since }, prescriberId: { not: null } }, _count: { _all: true } }),
      this.prisma.checkIn.groupBy({ by: ['reviewedById'], where: { reviewedAt: { gte: since }, reviewedById: { not: null } }, _count: { _all: true } }),
      this.prisma.consultation.groupBy({ by: ['clinicianId'], where: { status: 'IN_REVIEW', clinicianId: { not: null } }, _count: { _all: true } }),
    ]);

    const consultations = await this.prisma.consultation.findMany({
      where: { id: { in: [...new Set(audit.map((a) => a.resourceId))] } },
      select: { id: true, submittedAt: true },
    });
    const submittedAt = new Map(consultations.map((c) => [c.id, c.submittedAt]));

    const decisions: DecisionRecord[] = audit.map((a) => {
      const submitted = submittedAt.get(a.resourceId);
      return {
        clinicianId: a.actorId,
        action: a.action as DecisionRecord['action'],
        minutes: submitted ? (a.timestamp.getTime() - submitted.getTime()) / 60_000 : null,
      };
    });

    const toMap = <T extends { _count: { _all: number } }>(rows: T[], key: (r: T) => string | null) =>
      new Map(rows.filter((r) => key(r)).map((r) => [key(r) as string, r._count._all]));

    const all = summarisePerformance({
      clinicians,
      decisions,
      prescriptionsIssued: toMap(prescriptions, (r) => r.prescriberId),
      checkInsReviewed: toMap(reviews, (r) => r.reviewedById),
      openCases: toMap(open, (r) => r.clinicianId),
    });

    // Doctors are always listed; an admin only shows up once they have actually reviewed or prescribed.
    return all.filter((r) => r.role === ClinicianRole.DOCTOR || r.status === 'ACTIVE');
  }
}
