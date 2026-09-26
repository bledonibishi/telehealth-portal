import { Injectable } from '@nestjs/common';
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

  update(id: string, data: { firstName?: string; lastName?: string; email?: string; dateOfBirth?: Date }) {
    return this.prisma.patient.update({ where: { id }, data });
  }

  findByEmail(email: string) {
    return this.prisma.patient.findUnique({ where: { email } });
  }
}
