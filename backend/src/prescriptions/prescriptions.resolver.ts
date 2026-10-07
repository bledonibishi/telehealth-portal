import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { pharmacyStatementCsv } from './pharmacy-statement';
import { AuditRead } from '../audit/audit-read.interceptor';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionsService } from './prescriptions.service';
import { PrescribingService } from './prescribing.service';
import { PrescribingContextModel } from './models/prescribing-context.model';
import { findDose, findProgesteroneStrength, orderedTreatmentText } from '../catalog/ordered-dose';
import { PrescriptionModel } from './models/prescription.model';
import { PrescribingViolationModel } from './models/prescribing-check.model';
import { OrderModel } from './models/order.model';
import { OrdersService } from './orders.service';
import { ShipmentsService } from './shipments.service';
import { ShipmentAlertModel } from './models/shipment-alert.model';
import { PrescriptionItemInput } from './dto/prescription-item.input';
import { ChangeDoseInput } from './dto/change-dose.input';
import { ClinicianRole, ConsultationKind, OrderStatus, PrescriptionStatus, ProductCategory } from '../common/enums';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, accessRoleOf, CLINICAL_STAFF, DELIVERY_CONFIRMERS, FULFILMENT, PRESCRIBERS } from '../auth/access-roles';

@Resolver(() => PrescriptionModel)
export class PrescriptionsResolver {
  constructor(
    private prescriptionsService: PrescriptionsService,
    private prescribing: PrescribingService,
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private shipments: ShipmentsService,
  ) {}

  @Authorized(...CLINICAL_STAFF, 'PATIENT')
  @Query(() => PrescriptionModel)
  async prescription(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    const rx = await this.prescriptionsService.findById(id);
    if (user.role === 'PATIENT' && rx.patientId !== user.id) throw new ForbiddenException();
    return rx;
  }

  @Authorized(...CLINICAL_STAFF)
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
  @Query(() => PrescribingContextModel, { description: 'The dose paid for and what the prescription proof showed, for choosing a first dose' })
  async prescribingContext(@Args('consultationId', { type: () => ID }) consultationId: string): Promise<PrescribingContextModel> {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { patientId: true, patient: { select: { lead: { select: { quizAnswers: true } }, onboarding: true } } },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    const onboarding = consultation.patient.onboarding;
    const activeCount = await this.prisma.prescription.count({ where: { patientId: consultation.patientId, status: PrescriptionStatus.ACTIVE } });

    const noProof = onboarding?.prescriptionProofUnavailable === true;
    const review = onboarding?.prescriptionProofReview as
      | { fileId?: string; reading?: { medicineName?: string | null; doseMg?: number | null } | null; assessment?: { riskLevel?: string; suggestedDoseLabel?: string | null; safeMaxDoseLabel?: string | null } }
      | null
      | undefined;
    // Only a review of the proof that's on file now, and not when they've said they have none.
    const current = !noProof && review && review.fileId === onboarding?.prescriptionProofFileId ? review : null;
    const reading = current?.reading;

    const orderedText = orderedTreatmentText(consultation.patient.lead?.quizAnswers);
    const ordered = await findDose(this.prisma, orderedText, [ProductCategory.GLP1, ProductCategory.ESTROGEN, ProductCategory.TESTOSTERONE]);
    // HRT bought with the progesterone add-on: pre-select that medicine as well.
    const progesterone =
      ordered?.category === ProductCategory.ESTROGEN && /progesterone/i.test(orderedText ?? '') ? await findProgesteroneStrength(this.prisma) : null;

    return {
      orderedTreatment: orderedText ?? undefined,
      orderedProductId: ordered?.productId,
      orderedStrengthId: ordered?.strengthId,
      orderedProgesteroneProductId: progesterone?.productId,
      orderedProgesteroneStrengthId: progesterone?.strengthId,
      priorMedicationUse: onboarding?.priorMedicationUse ?? undefined,
      noProof,
      proofDose: reading?.doseMg != null ? `${reading.medicineName ?? ''} ${reading.doseMg} mg`.trim() : undefined,
      proofRiskLevel: current?.assessment?.riskLevel,
      safeNextDose: current?.assessment?.safeMaxDoseLabel ?? undefined,
      hasActivePrescription: activeCount > 0,
    };
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
  orders(
    @CurrentUser() user: AuthUser,
    @Args('status', { type: () => OrderStatus, nullable: true }) status?: OrderStatus,
    @Args('search', { nullable: true }) search?: string,
  ) {
    // The pharmacy can't see a patient's email or phone, so it can't search by them either (that would confirm them).
    return this.ordersService.findAll(status, search, accessRoleOf(user) !== ClinicianRole.PROVIDER);
  }

  @Authorized(...CLINICAL_STAFF)
  @Query(() => [OrderModel])
  patientOrders(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.ordersService.findByPatient(patientId);
  }

  @Authorized('PATIENT')
  @Query(() => [OrderModel])
  myOrders(@CurrentUser() user: AuthUser) {
    return this.ordersService.findOwn(user.id);
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [ShipmentAlertModel], { description: 'Patients whose next supply is coming up or late, most urgent first, with what is holding it up' })
  nextShipmentAlerts() {
    return this.shipments.nextShipments();
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => String, { description: 'CSV of what the pharmacy handed over in a month, with costs from PHARMACY_UNIT_COSTS where set' })
  async pharmacyStatement(@Args('year', { type: () => Int }) year: number, @Args('month', { type: () => Int }) month: number) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 2020 || year > 2100) throw new BadRequestException('Pick a valid month');
    let costs: Record<string, number> = {};
    try {
      costs = JSON.parse(process.env.PHARMACY_UNIT_COSTS || '{}');
    } catch {
      throw new BadRequestException('PHARMACY_UNIT_COSTS is not valid JSON');
    }
    return pharmacyStatementCsv(await this.ordersService.statementOrders(year, month), costs);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => OrderModel, { description: "Queue another supply against the prescription's repeats" })
  async createRepeatOrder(@CurrentUser() user: AuthUser, @Args('prescriptionId', { type: () => ID }) prescriptionId: string) {
    const order = await this.ordersService.createRepeat(user.id, prescriptionId);
    this.shipments.invalidate(); // the alert for this supply is now an order, not a reminder
    return order;
  }

  @Authorized(...DELIVERY_CONFIRMERS)
  @Mutation(() => OrderModel, { description: 'The pharmacy has packed it and handed it to a courier: record the courier, tracking and expected delivery window' })
  async dispatchOrder(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('pharmacyRef', { nullable: true }) pharmacyRef?: string,
    @Args('carrier', { nullable: true }) carrier?: string,
    @Args('trackingNumber', { nullable: true }) trackingNumber?: string,
    @Args('trackingUrl', { nullable: true }) trackingUrl?: string,
    @Args('estimatedDeliveryFrom', { nullable: true }) estimatedDeliveryFrom?: Date,
    @Args('estimatedDeliveryTo', { nullable: true }) estimatedDeliveryTo?: Date,
  ) {
    const order = await this.ordersService.dispatch(user.id, id, pharmacyRef, { carrier, trackingNumber, trackingUrl, estimatedDeliveryFrom, estimatedDeliveryTo });
    this.shipments.invalidate();
    return order;
  }

  @Authorized(...FULFILMENT)
  @Mutation(() => OrderModel, { description: 'The pharmacy confirms the courier has collected the parcel. No courier, tracking or address is entered here; the patient is told it is on its way' })
  async markOrderHandedOver(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    const order = await this.ordersService.handOver(user.id, id);
    this.shipments.invalidate();
    return order;
  }

  @Authorized(...FULFILMENT)
  @Mutation(() => OrderModel, { description: 'The pharmacy can’t supply this order. It is flagged to our team, who decide whether to cancel and refund; nothing is cancelled by this' })
  reportOrderCannotFulfil(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
  ) {
    return this.ordersService.reportCannotFulfil(user.id, id, reason);
  }

  @Authorized(...FULFILMENT)
  @Mutation(() => OrderModel, { description: 'The pharmacy has packed it and is waiting for the courier to collect it' })
  markOrderReadyForPickup(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.ordersService.markReadyForPickup(user.id, id);
  }

  @Authorized(...DELIVERY_CONFIRMERS)
  @Mutation(() => OrderModel, { description: 'Change the courier, tracking or expected delivery window of an order that is on its way' })
  updateOrderShipping(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('carrier', { nullable: true }) carrier?: string,
    @Args('trackingNumber', { nullable: true }) trackingNumber?: string,
    @Args('trackingUrl', { nullable: true }) trackingUrl?: string,
    @Args('estimatedDeliveryFrom', { nullable: true }) estimatedDeliveryFrom?: Date,
    @Args('estimatedDeliveryTo', { nullable: true }) estimatedDeliveryTo?: Date,
  ) {
    return this.ordersService.updateShipping(user.id, id, { carrier, trackingNumber, trackingUrl, estimatedDeliveryFrom, estimatedDeliveryTo });
  }

  @Authorized(...DELIVERY_CONFIRMERS)
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

  @Authorized(...DELIVERY_CONFIRMERS)
  @Mutation(() => OrderModel)
  markOrderDelivered(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.ordersService.markDelivered(user.id, id);
  }

  // Cancelling is for our team: the patient has paid, so it carries a refund decision the pharmacy doesn't make.
  @Authorized(...PRESCRIBERS)
  @Mutation(() => OrderModel, { description: 'Stop an order that has not been dispatched' })
  async cancelOrder(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
    @Args('refund', { defaultValue: false, description: 'Also refund the patient’s latest payment (admin only)' }) refund: boolean,
    @Args('endSubscription', { defaultValue: false, description: 'Also end the patient’s subscription (admin only)' }) endSubscription: boolean,
  ) {
    // Money decisions are the admin's; a doctor can cancel, but not refund.
    if ((refund || endSubscription) && user.clinicianRole !== 'ADMIN') throw new ForbiddenException('Only an admin can refund or end a subscription');
    const order = await this.ordersService.cancel(user.id, id, reason, { refund, endSubscription });
    this.shipments.invalidate();
    return order;
  }
}
