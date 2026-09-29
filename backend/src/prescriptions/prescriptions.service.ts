import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PrescriptionStatus, UserRole } from '../common/enums';
import { OrdersService } from './orders.service';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private orders: OrdersService,
  ) {}

  async findById(id: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id } });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  findByPatient(patientId: string) {
    return this.prisma.prescription.findMany({ where: { patientId }, orderBy: { issuedAt: 'desc' } });
  }

  async cancel(clinicianId: string, id: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('A reason is required to cancel a prescription');
    const rx = await this.findById(id);
    if (rx.status !== PrescriptionStatus.ACTIVE) {
      throw new BadRequestException(`Only an active prescription can be cancelled (this one is ${rx.status.toLowerCase()})`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.orders.cancelPendingFor(id, `Prescription cancelled: ${reason.trim()}`, tx);
      return tx.prescription.update({
        where: { id },
        data: { status: PrescriptionStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason.trim() },
      });
    });
    await this.audit.log({
      actorId: clinicianId,
      actorRole: UserRole.CLINICIAN,
      action: 'PRESCRIPTION_CANCELLED',
      resourceType: 'Prescription',
      resourceId: id,
      metadata: { reason: reason.trim() },
    });
    return updated;
  }

  findByConsultation(consultationId: string) {
    return this.prisma.prescription.findUnique({ where: { consultationId } });
  }
}
