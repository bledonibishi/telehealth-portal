import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { AuditRead } from '../audit/audit-read.interceptor';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionsService } from './prescriptions.service';
import { PrescribingService } from './prescribing.service';
import { PrescriptionModel } from './models/prescription.model';
import { PrescribingViolationModel } from './models/prescribing-check.model';
import { OrderModel } from './models/order.model';
import { OrdersService } from './orders.service';
import { ShipmentsService } from './shipments.service';
import { ShipmentAlertModel } from './models/shipment-alert.model';
import { PrescriptionItemInput } from './dto/prescription-item.input';
import { ChangeDoseInput } from './dto/change-dose.input';
import { ConsultationKind, OrderStatus } from '../common/enums';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, FULFILMENT, PRESCRIBERS, STAFF } from '../auth/access-roles';

@Resolver(() => PrescriptionModel)
export class PrescriptionsResolver {
  constructor(
    private prescriptionsService: PrescriptionsService,
    private prescribing: PrescribingService,
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private shipments: ShipmentsService,
  ) {}

  @Authorized(...STAFF, 'PATIENT')
  @Query(() => PrescriptionModel)
  async prescription(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    const rx = await this.prescriptionsService.findById(id);
    if (user.role === 'PATIENT' && rx.patientId !== user.id) throw new ForbiddenException();
    return rx;
  }

  @Authorized(...STAFF)
  @AuditRead('Patient', 'patientId')
  @Query(() => [PrescriptionModel], { description: "A patient's prescriptions, newest first, including superseded ones" })
  patientPrescriptions(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.prescriptionsService.findByPatient(patientId);
  }

  @Authorized('PATIENT')
  @Query(() => [PrescriptionModel])
  myPrescriptions(@CurrentUser() user: AuthUser) {
    return this.prescriptionsService.findByPatient(user.id);
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [PrescribingViolationModel], {
    description: 'Dry run of the prescribing rules for a consultation — what approval would reject or need a reason for',
  })
  async prescribingCheck(
    @Args('consultationId', { type: () => ID }) consultationId: string,
    @Args('items', { type: () => [PrescriptionItemInput] }) items: PrescriptionItemInput[],
  ) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    const { violations } = await this.prescribing.check({
      patientId: consultation.patientId,
      kind: consultation.kind as ConsultationKind,
      answers: (consultation.quizAnswers as any[]) ?? [],
      items,
    });
    return violations;
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => PrescriptionModel, { description: 'Stop a prescription; no further orders can be dispatched against it' })
  cancelPrescription(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
  ) {
    return this.prescriptionsService.cancel(user.id, id, reason);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => PrescriptionModel, {
    description: "Change a patient's dose directly — supersedes the current active prescription with a new one, any time (not just at a monthly check-in)",
  })
  changeDose(@CurrentUser() user: AuthUser, @Args('input') input: ChangeDoseInput) {
    return this.prescriptionsService.changeDose(user.id, input);
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  @Authorized(...FULFILMENT)
  @Query(() => [OrderModel], { description: 'Pharmacy fulfilment queue, newest first' })
  orders(@Args('status', { type: () => OrderStatus, nullable: true }) status?: OrderStatus) {
    return this.ordersService.findAll(status);
  }

  @Authorized(...STAFF)
  @Query(() => [OrderModel])
  patientOrders(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.ordersService.findByPatient(patientId);
  }

  @Authorized('PATIENT')
  @Query(() => [OrderModel])
  myOrders(@CurrentUser() user: AuthUser) {
    return this.ordersService.findOwn(user.id);
  }

  @Authorized(...FULFILMENT, ...PRESCRIBERS)
  @Query(() => [ShipmentAlertModel], { description: 'Patients whose next supply is coming up or late, most urgent first, with what is holding it up' })
  nextShipmentAlerts() {
    return this.shipments.nextShipments();
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => OrderModel, { description: "Queue another supply against the prescription's repeats" })
  async createRepeatOrder(@CurrentUser() user: AuthUser, @Args('prescriptionId', { type: () => ID }) prescriptionId: string) {
    const order = await this.ordersService.createRepeat(user.id, prescriptionId);
    this.shipments.invalidate(); // the alert for this supply is now an order, not a reminder
    return order;
  }

  @Authorized(...FULFILMENT)
  @Mutation(() => OrderModel)
  async dispatchOrder(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('pharmacyRef') pharmacyRef: string,
  ) {
    const order = await this.ordersService.dispatch(user.id, id, pharmacyRef);
    this.shipments.invalidate();
    return order;
  }

  @Authorized(...FULFILMENT)
  @Mutation(() => OrderModel)
  markOrderOutForDelivery(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('carrier', { nullable: true }) carrier?: string,
    @Args('trackingNumber', { nullable: true }) trackingNumber?: string,
    @Args('trackingUrl', { nullable: true }) trackingUrl?: string,
  ) {
    return this.ordersService.markOutForDelivery(user.id, id, carrier, trackingNumber, trackingUrl);
  }

  @Authorized(...FULFILMENT)
  @Mutation(() => OrderModel)
  markOrderDelivered(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.ordersService.markDelivered(user.id, id);
  }

  @Authorized(...FULFILMENT, ...PRESCRIBERS)
  @Mutation(() => OrderModel, { description: 'Stop an order that has not been dispatched' })
  async cancelOrder(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string, @Args('reason') reason: string) {
    const order = await this.ordersService.cancel(user.id, id, reason);
    this.shipments.invalidate();
    return order;
  }
}
