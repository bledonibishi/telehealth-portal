import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultationKind } from '../common/enums';
import { PRESCRIPTION_TEMPLATES } from './prescription-templates';

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

  /**
   * The prescription templates for a programme, matched to the live catalog. A template whose
   * product or strength has been withdrawn (or never seeded) is left out rather than half-filled.
   */
  async findTemplates(kind: ConsultationKind) {
    const products = await this.findProducts({ kind });
    return PRESCRIPTION_TEMPLATES.filter((t) => t.kind === kind).flatMap((t) => {
      const items = t.items.map((item) => {
        const product = products.find((p) => p.slug === item.productSlug);
        const strength = product?.strengths.find((s) => s.label === item.strengthLabel);
        if (!product || !strength) return null;
        const directions = item.directions ?? product.defaultDirections;
        if (!directions) return null;
        return { productId: product.id, strengthId: strength.id, quantity: item.quantity, directions };
      });
      if (items.some((i) => i === null)) return [];
      const { id, name, description, validityDays, refillsAllowed, notes } = t;
      return [{ id, kind, name, description, validityDays, refillsAllowed, notes, items: items as NonNullable<(typeof items)[number]>[] }];
    });
  }
}
