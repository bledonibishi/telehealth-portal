import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  findByConsultation(consultationId: string) {
    return this.prisma.prescription.findUnique({ where: { consultationId } });
  }

  findAllOrders() {
    return this.prisma.prescription.findMany({
      include: {
        consultation: {
          include: { patient: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  dispatch(id: string, pharmacyRef: string) {
    return this.prisma.prescription.update({
      where: { id },
      data: { dispatchedAt: new Date(), pharmacyRef },
      include: { consultation: { include: { patient: true } } },
    });
  }

  async markOutForDelivery(id: string, carrier?: string, trackingNumber?: string, trackingUrl?: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id } });
    if (!rx) throw new NotFoundException('Order not found');
    if (!rx.dispatchedAt) throw new BadRequestException('Order must be dispatched before it can be out for delivery');

    return this.prisma.prescription.update({
      where: { id },
      data: { outForDeliveryAt: new Date(), carrier, trackingNumber, trackingUrl },
      include: { consultation: { include: { patient: true } } },
    });
  }

  async markDelivered(id: string) {
    const rx = await this.prisma.prescription.findUnique({ where: { id } });
    if (!rx) throw new NotFoundException('Order not found');
    if (!rx.outForDeliveryAt) throw new BadRequestException('Order must be out for delivery before it can be marked delivered');

    return this.prisma.prescription.update({
      where: { id },
      data: { deliveredAt: new Date() },
      include: { consultation: { include: { patient: true } } },
    });
  }
}
