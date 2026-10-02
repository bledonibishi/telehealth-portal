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
@Injectable()
export class ShipmentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async nextShipments(now = new Date()): Promise<ShipmentAlert[]> {
    const cycleDays = positiveInt(this.config.get<string>('SHIPMENT_CYCLE_DAYS'), DEFAULT_SUPPLY_CYCLE_DAYS);
    const leadDays = positiveInt(this.config.get<string>('SHIPMENT_LEAD_DAYS'), DEFAULT_ALERT_LEAD_DAYS);

    const prescriptions = await this.prisma.prescription.findMany({
      where: {
        status: PrescriptionStatus.ACTIVE,
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        patient: { activatedAt: { not: null } },
        orders: { some: { status: { in: [OrderStatus.DISPATCHED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED] } } },
      },
      select: {
        id: true,
        medication: true,
        refillsAllowed: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        orders: { where: { status: { not: OrderStatus.CANCELLED } }, select: { status: true, dispatchedAt: true } },
      },
    });
    if (prescriptions.length === 0) return [];

    const checkIns = await this.prisma.checkIn.findMany({
      where: { patientId: { in: [...new Set(prescriptions.map((p) => p.patient.id))] } },
      orderBy: { createdAt: 'desc' },
      select: { patientId: true, completedAt: true, reviewedAt: true, outcome: true },
    });
    // The newest completed check-in per patient, and whether they have any check-ins at all.
    const latestDone = new Map<string, (typeof checkIns)[number]>();
    const patientsWithCheckIns = new Set<string>();
    for (const c of checkIns) {
      patientsWithCheckIns.add(c.patientId);
      const best = latestDone.get(c.patientId);
      if (c.completedAt && (!best || c.completedAt > best.completedAt!)) latestDone.set(c.patientId, c);
    }

    return prescriptions
      .map((rx) =>
        evaluateShipment(
          {
            prescription: rx,
            patient: { id: rx.patient.id, name: `${rx.patient.firstName} ${rx.patient.lastName}` },
            orders: rx.orders,
            latestCheckIn: latestDone.get(rx.patient.id) ?? null,
            hasCheckIns: patientsWithCheckIns.has(rx.patient.id),
          },
          { now, cycleDays, leadDays },
        ),
      )
      .filter((a): a is ShipmentAlert => a !== null)
      .sort(sortAlerts);
  }

  /** How many shipments are due now or late — the number on the bell. */
  async dueCount(now = new Date()) {
    return (await this.nextShipments(now)).filter((a) => a.urgency !== 'UPCOMING').length;
  }
}
