import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DosingService } from '../dosing/dosing.service';
import { ConsultationKind, DoseStatus, PrescriptionStatus } from '../common/enums';
import { ShipmentsService } from './shipments.service';
import { DEFAULT_SUPPLY_CYCLE_DAYS } from './shipment-alerts';
import { PROGRAMME, frequencyOf, planSpan, supplyDoses } from './treatment-plan';
import { TreatmentPlanModel } from './models/treatment-plan.model';

/** Enough to walk a long dose-change history without risking an endless loop on bad data. */
const MAX_CHAIN = 50;

@Injectable()
export class TreatmentPlanService {
  constructor(
    private prisma: PrismaService,
    private shipments: ShipmentsService,
    private dosing: DosingService,
  ) {}

  /** The patient's active prescription as a plan: what, how often, since when, and how far through it they are. */
  async forPatient(patientId: string, now = new Date()): Promise<TreatmentPlanModel | null> {
    const rx = await this.prisma.prescription.findFirst({
      where: { patientId, status: PrescriptionStatus.ACTIVE },
      orderBy: { issuedAt: 'desc' },
      include: {
        items: { include: { product: true, strength: true } },
        prescriber: { select: { firstName: true, lastName: true } },
        orders: { where: { status: { not: 'CANCELLED' } }, select: { id: true } },
      },
    });
    if (!rx) return null;

    // Dose changes are new prescriptions that supersede the old one: the programme started with the first.
    const chainIds = [rx.id];
    let startedAt = rx.issuedAt;
    let previousId = rx.supersedesId;
    for (let i = 0; previousId && i < MAX_CHAIN; i++) {
      const prev = await this.prisma.prescription.findUnique({ where: { id: previousId }, select: { id: true, issuedAt: true, supersedesId: true } });
      if (!prev) break;
      chainIds.push(prev.id);
      startedAt = prev.issuedAt;
      previousId = prev.supersedesId;
    }

    const item = rx.items[0];
    const freq = item ? frequencyOf(item.product, rx.instructions) : { label: rx.instructions, dosesPerWeek: null };
    const span = planSpan(startedAt, rx.validUntil, freq.dosesPerWeek, now);
    const kind = (item?.product.kind as ConsultationKind | undefined) ?? null;

    const [dosesTaken, alert, summary] = await Promise.all([
      this.prisma.doseEvent.count({ where: { patientId, status: DoseStatus.TAKEN, prescriptionItem: { prescriptionId: { in: chainIds } } } }),
      this.shipments.forPatient(patientId),
      this.dosing.summaryFor(patientId),
    ]);

    let supply: { total: number; taken: number } | null = null;
    if (alert && alert.prescriptionId === rx.id) {
      const scheduled = await this.prisma.doseEvent.findMany({
        where: { patientId, prescriptionItemId: { in: rx.items.map((i) => i.id) }, scheduledFor: { gte: alert.lastShippedAt, lt: alert.nextDueAt } },
        select: { status: true },
      });
      const cycleDays = Math.round((alert.nextDueAt.getTime() - alert.lastShippedAt.getTime()) / 86_400_000) || DEFAULT_SUPPLY_CYCLE_DAYS;
      supply = supplyDoses(scheduled, cycleDays, freq.dosesPerWeek);
    }

    return {
      prescriptionId: rx.id,
      kind,
      programme: (kind && PROGRAMME[kind]) || 'Your treatment',
      productName: item?.product.brandName ?? item?.product.name ?? rx.medication,
      genericName: item?.product.brandName ? item.product.name : null,
      strength: item?.strength.label ?? rx.dosage,
      titrationStep: item?.strength.titrationStep ?? null,
      frequency: freq.label,
      dosesPerWeek: freq.dosesPerWeek,
      directions: item?.directions ?? rx.instructions,
      prescriberName: rx.prescriber ? `Dr. ${rx.prescriber.firstName} ${rx.prescriber.lastName}` : null,
      startedAt,
      validUntil: rx.validUntil,
      durationWeeks: span.durationWeeks,
      weeksElapsed: span.weeksElapsed,
      dosesTaken,
      dosesPlanned: span.dosesPlanned,
      supplyDosesTotal: supply?.total ?? null,
      supplyDosesTaken: supply?.taken ?? null,
      nextDoseAt: summary?.nextDoseAt ?? null,
      repeatsLeft: Math.max(rx.refillsAllowed - Math.max(rx.orders.length - 1, 0), 0),
    };
  }
}
