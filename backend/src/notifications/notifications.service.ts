import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getCounts() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [newLeads, pendingConsultations, pendingOrders, consultationsWithMessages] =
      await Promise.all([
        // Leads created in the last 24h
        this.prisma.lead.count({ where: { createdAt: { gte: since24h } } }),

        // Consultations awaiting clinical review
        this.prisma.consultation.count({
          where: { status: { in: ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'] } },
        }),

        // Prescriptions not yet dispatched
        this.prisma.prescription.count({ where: { dispatchedAt: null } }),

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
      ]);

    const patientMessages = consultationsWithMessages.filter(
      (c) => c.messages[0]?.senderRole === 'PATIENT',
    ).length;

    return { newLeads, pendingConsultations, patientMessages, pendingOrders };
  }
}
