import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultationKind } from '../common/enums';

const WITH_STRENGTHS = { strengths: { orderBy: { sortOrder: 'asc' as const } } };

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  findProducts(filter: { kind?: ConsultationKind; includeInactive?: boolean }) {
    return this.prisma.product.findMany({
      where: {
        ...(filter.kind && { kind: filter.kind }),
        ...(!filter.includeInactive && { active: true }),
      },
      include: filter.includeInactive
        ? WITH_STRENGTHS
        : { strengths: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ kind: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  setProductActive(id: string, active: boolean) {
    return this.prisma.product.update({ where: { id }, data: { active }, include: WITH_STRENGTHS });
  }

  async setStrengthActive(id: string, active: boolean) {
    const strength = await this.prisma.productStrength.update({ where: { id }, data: { active } });
    return this.prisma.product.findUniqueOrThrow({ where: { id: strength.productId }, include: WITH_STRENGTHS });
  }
}
