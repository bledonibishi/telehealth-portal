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
    return this.prisma.patient.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.patient.findUnique({ where: { email } });
  }
}
