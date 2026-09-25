import { Injectable } from '@nestjs/common';
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
}
