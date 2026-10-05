import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PrescriptionStatus } from '../common/enums';
import {
  DEFAULT_ALERT_LEAD_DAYS,
  DEFAULT_SUPPLY_CYCLE_DAYS,
  evaluateShipment,
  sortAlerts,
  type ShipmentAlert,
} from './shipment-alerts';

const positiveInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Looks across everyone on an active prescription and lists whose next supply is coming up or late,
 * and what is holding it up — so treatment doesn't lapse because an order was forgotten.
 *   SHIPMENT_CYCLE_DAYS  how long one supply lasts (default 30)
 *   SHIPMENT_LEAD_DAYS   how many days before it runs out to start warning (default 5)
 */
/** The list is the same for everyone and costly to build, so it is shared for a short while. */
const ALERTS_TTL_MS = 30_000;

@Injectable()
export class ShipmentsService {
  private cached: { at: number; value: ShipmentAlert[] } | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** How many days before a supply runs out the patient may ask for the next one (and staff start to be warned). */
  get leadDays() {
    return positiveInt(this.config.get<string>('SHIPMENT_LEAD_DAYS'), DEFAULT_ALERT_LEAD_DAYS);
  }

  /**
   * One patient's own shipment, however far off it is (the shared list only holds those near enough to
   * warn about). Null when nothing has shipped yet, an order is already waiting, or they have no active prescription.
   */
  async forPatient(patientId: string): Promise<ShipmentAlert | null> {
    const [alert] = await this.compute(new Date(), { patientId, leadDays: 36_500 });
    return alert ?? null;
  }

  /** Forget the shared list, e.g. right after an order was placed, dispatched or cancelled. */
  invalidate() {
    this.cached = null;
  }

  async nextShipments(now?: Date): Promise<ShipmentAlert[]> {
    // Only a call for "right now" is cached; asking about a given moment always computes.
    if (!now && this.cached && Date.now() - this.cached.at < ALERTS_TTL_MS) return this.cached.value;
    const value = await this.compute(now ?? new Date());
    if (!now) this.cached = { at: Date.now(), value };
    return value;
  }

  private async compute(now: Date, only: { patientId?: string; leadDays?: number } = {}): Promise<ShipmentAlert[]> {
    const cycleDays = positiveInt(this.config.get<string>('SHIPMENT_CYCLE_DAYS'), DEFAULT_SUPPLY_CYCLE_DAYS);
    const leadDays = only.leadDays ?? this.leadDays;

    const prescriptions = await this.prisma.prescription.findMany({
      where: {
        status: PrescriptionStatus.ACTIVE,
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        ...(only.patientId && { patientId: only.patientId }),
        patient: { activatedAt: { not: null }, subscriptionEndedAt: null },
        orders: { some: { status: { in: [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED] } } },
      },
      select: {
        id: true,
        medication: true,
        refillsAllowed: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        orders: { where: { status: { not: OrderStatus.CANCELLED } }, select: { status: true, dispatchedAt: true } },
        refillRequests: { where: { resolvedAt: null }, orderBy: { requestedAt: 'desc' }, take: 1, select: { requestedAt: true } },
      },
    });
    if (prescriptions.length === 0) return [];

    // The newest completed check-in per patient, not their whole history: find each patient's
    // latest completion time, then read just those rows.
    const patientIds = [...new Set(prescriptions.map((p) => p.patient.id))];
    const [latestTimes, withAny] = await Promise.all([
      this.prisma.checkIn.groupBy({ by: ['patientId'], where: { patientId: { in: patientIds }, completedAt: { not: null } }, _max: { completedAt: true } }),
      this.prisma.checkIn.groupBy({ by: ['patientId'], where: { patientId: { in: patientIds } } }),
    ]);
    const completed = latestTimes.length
      ? await this.prisma.checkIn.findMany({
          where: { OR: latestTimes.map((l) => ({ patientId: l.patientId, completedAt: l._max.completedAt! })) },
          select: { patientId: true, completedAt: true, reviewedAt: true, outcome: true },
        })
      : [];
    const latestDone = new Map(completed.map((c) => [c.patientId, c]));
    const patientsWithCheckIns = new Set(withAny.map((c) => c.patientId));

    return prescriptions
      .map((rx) =>
        evaluateShipment(
          {
            prescription: rx,
            patient: { id: rx.patient.id, name: `${rx.patient.firstName} ${rx.patient.lastName}` },
            orders: rx.orders,
            latestCheckIn: latestDone.get(rx.patient.id) ?? null,
            hasCheckIns: patientsWithCheckIns.has(rx.patient.id),
            refillRequestedAt: rx.refillRequests[0]?.requestedAt ?? null,
          },
          { now, cycleDays, leadDays },
        ),
      )
      .filter((a): a is ShipmentAlert => a !== null)
      .sort(sortAlerts);
  }

  /** How many shipments are due now or late, or that a patient has asked for — the number on the bell. */
  async dueCount(now?: Date) {
    return (await this.nextShipments(now)).filter((a) => a.urgency !== 'UPCOMING' || a.refillRequestedAt).length;
  }
}
