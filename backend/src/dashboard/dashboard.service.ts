import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMetrics() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalLeads,
      leadsThisWeek,
      newLeadsToday,
      totalPatients,
      activePatients,
      newPatientsThisWeek,
      pendingConsultations,
      approvedConsultations,
      pendingOrders,
      dispatchedOrders,
    ] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { createdAt: { gte: startOfWeek } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.patient.count(),
      this.prisma.patient.count({ where: { activatedAt: { not: null } } }),
      this.prisma.patient.count({ where: { createdAt: { gte: startOfWeek } } }),
      this.prisma.consultation.count({
        where: { status: { in: ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'] } },
      }),
      this.prisma.consultation.count({ where: { status: 'APPROVED' } }),
      this.prisma.prescription.count({ where: { dispatchedAt: null } }),
      this.prisma.prescription.count({ where: { dispatchedAt: { not: null } } }),
    ]);

    const conversionRate =
      totalLeads > 0 ? Math.round((totalPatients / totalLeads) * 100 * 10) / 10 : 0;

    return {
      totalLeads,
      leadsThisWeek,
      newLeadsToday,
      totalPatients,
      activePatients,
      newPatientsThisWeek,
      conversionRate,
      pendingConsultations,
      approvedConsultations,
      pendingOrders,
      dispatchedOrders,
    };
  }
}
