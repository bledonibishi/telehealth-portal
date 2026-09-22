import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.patient.findUnique({ where: { id } });
  }
}
