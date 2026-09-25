import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicianRole } from '@prisma/client';

@Injectable()
export class CliniciansService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.clinician.findMany({ orderBy: { createdAt: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.clinician.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.clinician.findUnique({ where: { email } });
  }

  updateRole(id: string, role: ClinicianRole) {
    return this.prisma.clinician.update({ where: { id }, data: { role } });
  }
}
