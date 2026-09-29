import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateDeliveryDetailsInput } from './dto/update-delivery-details.input';
import { UpdatePatientInput } from './dto/update-patient.input';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.patient.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: {
        consultations: {
          orderBy: { submittedAt: 'desc' },
          include: {
            redFlags: true,
            prescription: true,
            messages: { orderBy: { sentAt: 'asc' } },
            clinician: true,
          },
        },
        checkIns: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async updateDeliveryDetails(id: string, input: UpdateDeliveryDetailsInput) {
    const data = Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]),
    ) as Record<keyof UpdateDeliveryDetailsInput, string | null>;
    for (const key of ['phone', 'addressLine1', 'city', 'postcode', 'country'] as const) {
      if (!data[key]) throw new BadRequestException('Please fill in your phone number and full delivery address');
    }
    return this.prisma.patient.update({ where: { id }, data });
  }

  update(id: string, data: Omit<UpdatePatientInput, 'id'>) {
    return this.prisma.patient.update({ where: { id }, data });
  }

  async productKindOf(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id }, include: { lead: true } });
    return patient?.lead?.productKind ?? null;
  }

  findByEmail(email: string) {
    return this.prisma.patient.findUnique({ where: { email } });
  }
}
