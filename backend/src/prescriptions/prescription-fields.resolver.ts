import { Resolver, ResolveField, Parent, Int } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionItemModel, PrescriptionModel } from './models/prescription.model';
import { ClinicianModel } from '../clinicians/models/clinician.model';
import { OrderModel } from './models/order.model';
import { OrderStatus } from '../common/enums';

type Parent = { id: string };

// Items and prescriber are resolved on demand so every existing
// `include: { prescription: true }` across the app keeps working unchanged.
@Resolver(() => PrescriptionModel)
export class PrescriptionFieldsResolver {
  constructor(private prisma: PrismaService) {}

  @ResolveField(() => [PrescriptionItemModel])
  items(@Parent() rx: { id: string; items?: unknown[] }) {
    if (rx.items && (rx.items[0] as any)?.product) return rx.items;
    return this.prisma.prescriptionItem.findMany({
      where: { prescriptionId: rx.id },
      include: { product: { include: { strengths: true } }, strength: true },
    });
  }

  @ResolveField(() => ClinicianModel, { nullable: true })
  prescriber(@Parent() rx: { prescriberId: string | null; prescriber?: unknown }) {
    if (rx.prescriber !== undefined) return rx.prescriber;
    return rx.prescriberId ? this.prisma.clinician.findUnique({ where: { id: rx.prescriberId } }) : null;
  }

  @ResolveField(() => String, { description: 'Authenticated link to the prescription PDF' })
  documentUrl(@Parent() rx: { id: string }) {
    return `/prescriptions/${rx.id}/document`;
  }

  // One lookup per prescription, shared by all the fulfilment fields below.
  private latest = new WeakMap<object, Promise<any>>();
  private latestOrder(rx: Parent) {
    if (!this.latest.has(rx)) {
      this.latest.set(
        rx,
        this.prisma.order.findFirst({
          where: { prescriptionId: rx.id, status: { not: OrderStatus.CANCELLED } },
          orderBy: { sequence: 'desc' },
        }),
      );
    }
    return this.latest.get(rx)!;
  }

  @ResolveField(() => [OrderModel])
  orders(@Parent() rx: Parent) {
    return this.prisma.order.findMany({
      where: { prescriptionId: rx.id },
      include: { patient: true, prescription: true },
      orderBy: { sequence: 'asc' },
    });
  }

  @ResolveField(() => Int, { description: 'Repeats not yet ordered' })
  async repeatsRemaining(@Parent() rx: Parent & { refillsAllowed: number }) {
    const live = await this.prisma.order.count({ where: { prescriptionId: rx.id, status: { not: OrderStatus.CANCELLED } } });
    return Math.max(rx.refillsAllowed - Math.max(live - 1, 0), 0);
  }

  @ResolveField(() => String, { nullable: true, deprecationReason: 'Use orders' })
  async pharmacyRef(@Parent() rx: Parent) {
    return (await this.latestOrder(rx))?.pharmacyRef ?? null;
  }

  @ResolveField(() => Date, { nullable: true, deprecationReason: 'Use orders' })
  async dispatchedAt(@Parent() rx: Parent) {
    return (await this.latestOrder(rx))?.dispatchedAt ?? null;
  }

  @ResolveField(() => String, { nullable: true, deprecationReason: 'Use orders' })
  async carrier(@Parent() rx: Parent) {
    return (await this.latestOrder(rx))?.carrier ?? null;
  }

  @ResolveField(() => String, { nullable: true, deprecationReason: 'Use orders' })
  async trackingNumber(@Parent() rx: Parent) {
    return (await this.latestOrder(rx))?.trackingNumber ?? null;
  }

  @ResolveField(() => String, { nullable: true, deprecationReason: 'Use orders' })
  async trackingUrl(@Parent() rx: Parent) {
    return (await this.latestOrder(rx))?.trackingUrl ?? null;
  }

  @ResolveField(() => Date, { nullable: true, deprecationReason: 'Use orders' })
  async outForDeliveryAt(@Parent() rx: Parent) {
    return (await this.latestOrder(rx))?.outForDeliveryAt ?? null;
  }

  @ResolveField(() => Date, { nullable: true, deprecationReason: 'Use orders' })
  async deliveredAt(@Parent() rx: Parent) {
    return (await this.latestOrder(rx))?.deliveredAt ?? null;
  }
}
