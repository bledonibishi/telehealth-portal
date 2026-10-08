import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OPEN_ALERTS_WHERE } from '../side-effects/side-effects';
import { DosingService } from '../dosing/dosing.service';
import { ShipmentsService } from '../prescriptions/shipments.service';

// The bell polls every 30s per open tab; the missed-dose scan only changes when
// doses are logged or the hourly job runs, so a minute-old count is plenty fresh.
const MISSED_DOSE_COUNT_TTL_MS = 60_000;

const ORDER_PROBLEM_STATUSES = ['DELIVERY_FAILED', 'RETURNED', 'EXCEPTION', 'CANNOT_FULFIL'];

@Injectable()
export class NotificationsService {
  private missedDoseCount: { value: number; at: number } | null = null;
  private shipmentsDue: { value: number; at: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private dosing: DosingService,
    private shipments: ShipmentsService,
  ) {}

  /** Adherence counts are prescriber-only, like the list behind them; other staff get 0. */
  async getCounts({
    includeMissedDoses = false,
    includeShipments = false,
    includeSideEffects = false,
    includeAppointments = false,
    includeOrderProblems = false,
  }: { includeMissedDoses?: boolean; includeShipments?: boolean; includeSideEffects?: boolean; includeAppointments?: boolean; includeOrderProblems?: boolean } = {}) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [newLeads, pendingConsultations, pendingOrders, consultationsWithMessages, preConsultationThreads, missedDoseAlerts, shipmentsDue, sideEffectAlerts, urgentAppointments, orderProblems, refundRequests] =
      await Promise.all([
        // Leads created in the last 24h
        this.prisma.lead.count({ where: { createdAt: { gte: since24h } } }),

        // Consultations awaiting clinical review
        this.prisma.consultation.count({
          where: { status: { in: ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'] } },
        }),

        // Orders waiting for the pharmacy
        this.prisma.order.count({ where: { status: 'PENDING' } }),

        // Find consultations where the last message was from a patient
        this.prisma.consultation.findMany({
          where: { messages: { some: {} } },
          select: {
            id: true,
            messages: {
              orderBy: { sentAt: 'desc' },
              take: 1,
              select: { senderRole: true },
            },
          },
        }),

        // Patients without a consultation yet whose last message is theirs
        this.prisma.patient.findMany({
          where: { messages: { some: { consultationId: null } } },
          select: {
            messages: { where: { consultationId: null }, orderBy: { sentAt: 'desc' }, take: 1, select: { senderRole: true } },
          },
        }),

        // GLP-1 patients who may need re-titrating after missed doses
        includeMissedDoses ? this.countMissedDoseAlerts() : 0,

        // Next supplies that are due or late
        includeShipments ? this.countShipmentsDue() : 0,

        // Side effects patients reported that no doctor has acknowledged yet
        includeSideEffects ? this.prisma.sideEffectReport.count({ where: OPEN_ALERTS_WHERE }) : 0,

        // Urgent appointment requests nobody has answered (they must be within 24 hours)
        includeAppointments ? this.prisma.appointmentRequest.count({ where: { status: 'REQUESTED', urgency: 'URGENT' } }) : 0,

        // Orders that went wrong on the way, or that the pharmacy cannot supply
        includeOrderProblems ? this.countOrderProblems() : 0,

        // Patients asking for their money back
        includeOrderProblems ? this.prisma.refundRequest.count({ where: { status: 'REQUESTED' } }) : 0,
      ]);

    const patientMessages =
      consultationsWithMessages.filter((c) => c.messages[0]?.senderRole === 'PATIENT').length +
      preConsultationThreads.filter((p) => p.messages[0]?.senderRole === 'PATIENT').length;

    return { newLeads, pendingConsultations, patientMessages, pendingOrders, missedDoseAlerts, shipmentsDue, sideEffectAlerts, urgentAppointments, orderProblems, refundRequests };
  }

  /** Open orders whose latest tracking word is a problem, or whose expected date has passed. */
  private async countOrderProblems() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['PENDING', 'DISPATCHED', 'OUT_FOR_DELIVERY'] } },
      select: { status: true, estimatedDeliveryTo: true, trackingEvents: { orderBy: { occurredAt: 'desc' }, take: 1, select: { status: true } } },
    });
    const now = Date.now();
    return orders.filter((o) => {
      const latest = o.trackingEvents[0]?.status;
      if (latest && ORDER_PROBLEM_STATUSES.includes(latest)) return true;
      return o.status !== 'PENDING' && !!o.estimatedDeliveryTo && o.estimatedDeliveryTo.getTime() + 12 * 3_600_000 < now;
    }).length;
  }

  private async countMissedDoseAlerts() {
    if (this.missedDoseCount && Date.now() - this.missedDoseCount.at < MISSED_DOSE_COUNT_TTL_MS) return this.missedDoseCount.value;
    const value = (await this.dosing.missedDoseAlerts()).length;
    this.missedDoseCount = { value, at: Date.now() };
    return value;
  }

  private async countShipmentsDue() {
    if (this.shipmentsDue && Date.now() - this.shipmentsDue.at < MISSED_DOSE_COUNT_TTL_MS) return this.shipmentsDue.value;
    const value = await this.shipments.dueCount();
    this.shipmentsDue = { value, at: Date.now() };
    return value;
  }
}
