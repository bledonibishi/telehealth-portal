import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadInput } from './dto/create-lead.input';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.lead.findUniqueOrThrow({ where: { id } });
  }

  async upsert(input: CreateLeadInput) {
    return this.prisma.lead.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        productKind: input.productKind,
        quizAnswers: input.quizAnswers as any,
        stripeSessionId: input.stripeSessionId,
      },
      update: {
        productKind: input.productKind,
        quizAnswers: input.quizAnswers as any,
        stripeSessionId: input.stripeSessionId ?? undefined,
      },
    });
  }

  markConverted(id: string) {
    return this.prisma.lead.update({
      where: { id },
      data: { convertedAt: new Date() },
    });
  }
}
