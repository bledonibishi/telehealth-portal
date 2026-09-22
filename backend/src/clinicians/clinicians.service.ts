import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CliniciansService {
  constructor(private prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.clinician.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.clinician.findUnique({ where: { email } });
  }
}
