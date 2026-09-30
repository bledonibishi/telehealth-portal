import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DosingService } from '../dosing/dosing.service';

// The bell polls every 30s per open tab; the missed-dose scan only changes when
// doses are logged or the hourly job runs, so a minute-old count is plenty fresh.
const MISSED_DOSE_COUNT_TTL_MS = 60_000;

@Injectable()
export class NotificationsService {
  private missedDoseCount: { value: number; at: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private dosing: DosingService,
  ) {}

  /** Adherence counts are prescriber-only, like the list behind them; other staff get 0. */
  async getCounts({ includeMissedDoses = false }: { includeMissedDoses?: boolean } = {}) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [newLeads, pendingConsultations, pendingOrders, consultationsWithMessages, missedDoseAlerts] =
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

        // GLP-1 patients who may need re-titrating after missed doses
        includeMissedDoses ? this.countMissedDoseAlerts() : 0,
      ]);

    const patientMessages = consultationsWithMessages.filter(
      (c) => c.messages[0]?.senderRole === 'PATIENT',
    ).length;

    return { newLeads, pendingConsultations, patientMessages, pendingOrders, missedDoseAlerts };
  }

  private async countMissedDoseAlerts() {
    if (this.missedDoseCount && Date.now() - this.missedDoseCount.at < MISSED_DOSE_COUNT_TTL_MS) return this.missedDoseCount.value;
    const value = (await this.dosing.missedDoseAlerts()).length;
    this.missedDoseCount = { value, at: Date.now() };
    return value;
  }
}
