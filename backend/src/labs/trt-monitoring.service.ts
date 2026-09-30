import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionStatus, ProductCategory } from '../common/enums';
import { MONITORED_KINDS, monitoringStatus } from './trt-monitoring';
import { TrtMonitoringModel, TrtMonitoringQueueEntryModel } from './models/trt-monitoring.model';

type Db = PrismaService | Prisma.TransactionClient;
const DAY = 86_400_000;
// The clinician queue also lists tests coming due this soon, so they can be booked.
const DUE_SOON_DAYS = 14;

const TRT_ITEM = { items: { some: { product: { category: ProductCategory.TESTOSTERONE } } } } satisfies Prisma.PrescriptionWhereInput;

/**
 * Blood-test monitoring for patients on testosterone: what's due when, and
 * whether repeat supplies must wait (a test well overdue, or haematocrit too
 * high). Initial supplies aren't held — the baseline is due at the start.
 */
@Injectable()
export class TrtMonitoringService {
  constructor(private prisma: PrismaService) {}

  /** Null unless the patient is currently on testosterone. */
  async statusFor(patientId: string, db: Db = this.prisma): Promise<TrtMonitoringModel | null> {
    const rxs = await db.prescription.findMany({
      where: { patientId, status: { not: PrescriptionStatus.CANCELLED }, ...TRT_ITEM },
      select: { issuedAt: true, status: true },
      orderBy: { issuedAt: 'asc' },
    });
    if (!rxs.some((r) => r.status === PrescriptionStatus.ACTIVE)) return null;

    const results = await db.labResult.findMany({
      where: { patientId, kind: { in: [...MONITORED_KINDS] } },
      select: { kind: true, value: true, unit: true, collectedAt: true },
    });
    return this.toModel(patientId, rxs[0].issuedAt, results);
  }

  /** TRT patients on hold, with a warning, or with a test due soon — most urgent first. */
  async queue(): Promise<TrtMonitoringQueueEntryModel[]> {
    const patients = await this.prisma.patient.findMany({
      where: { prescriptions: { some: { status: PrescriptionStatus.ACTIVE, ...TRT_ITEM } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        prescriptions: { where: { status: { not: PrescriptionStatus.CANCELLED }, ...TRT_ITEM }, select: { issuedAt: true }, orderBy: { issuedAt: 'asc' }, take: 1 },
        labResults: { where: { kind: { in: [...MONITORED_KINDS] } }, select: { kind: true, value: true, unit: true, collectedAt: true } },
      },
    });
    const soon = Date.now() + DUE_SOON_DAYS * DAY;
    return patients
      .map((p) => ({ patientName: `${p.firstName} ${p.lastName}`, monitoring: this.toModel(p.id, p.prescriptions[0].issuedAt, p.labResults) }))
      .filter(({ monitoring: m }) => m.refillsOnHold || m.warnings.length > 0 || m.labs.some((l) => l.dueAt.getTime() <= soon))
      .sort(({ monitoring: a }, { monitoring: b }) => Number(b.refillsOnHold) - Number(a.refillsOnHold) || b.warnings.length - a.warnings.length || earliestDue(a) - earliestDue(b));
  }

  /** Throws when a repeat supply of a testosterone prescription must wait for blood tests. */
  async assertRepeatAllowed(prescriptionId: string, db: Db = this.prisma) {
    const rx = await db.prescription.findFirst({ where: { id: prescriptionId, ...TRT_ITEM }, select: { patientId: true } });
    if (!rx) return; // not testosterone
    const status = await this.statusFor(rx.patientId, db);
    if (status?.refillsOnHold) {
      throw new BadRequestException(
        `Testosterone repeat on hold: ${status.holdReasons.join('; ')}. Enter the latest results, or change the prescription, first.`,
      );
    }
  }

  private toModel(patientId: string, startedAt: Date, results: { kind: string; value: number; unit: string; collectedAt: Date }[]): TrtMonitoringModel {
    const status = monitoringStatus(startedAt, results);
    return {
      patientId,
      startedAt,
      labs: status.kinds.map((k) => ({
        kind: k.kind,
        dueAt: k.dueAt,
        overdue: k.overdue,
        lastValue: k.last?.value,
        lastUnit: k.last?.unit,
        lastCollectedAt: k.last?.collectedAt,
      })),
      refillsOnHold: status.holdReasons.length > 0,
      holdReasons: status.holdReasons,
      warnings: status.warnings,
    };
  }
}

const earliestDue = (s: TrtMonitoringModel) => Math.min(...s.labs.map((l) => l.dueAt.getTime()));
