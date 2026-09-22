import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  findByConsultation(consultationId: string) {
    return this.prisma.prescription.findUnique({ where: { consultationId } });
  }
}
