import { Resolver, Query, Mutation, Args, ID, Int, ObjectType, Field } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';
import { RefundRequestsService } from './refund-requests.service';

@ObjectType('RefundRequest')
export class RefundRequestModel {
  @Field(() => ID) id: string;
  @Field() status: string;
  @Field() requestedAt: Date;
  @Field({ nullable: true }) decidedAt?: Date;
  @Field({ nullable: true, description: 'What happened to the money, once decided' }) outcome?: string;
}

@ObjectType('RefundRequestForReview')
export class RefundRequestForReviewModel extends RefundRequestModel {
  @Field(() => ID) patientId: string;
  @Field() patientName: string;
  @Field() patientEmail: string;
  @Field({ nullable: true, description: 'Where the patient’s latest order is (PENDING means still at the pharmacy)' }) latestOrderStatus?: string;
  @Field({ nullable: true }) latestOrderSequence?: number;
}

@ObjectType('RefundAwaitingReturn')
export class RefundAwaitingReturnModel extends RefundRequestForReviewModel {
  @Field(() => ID, { nullable: true }) awaitingOrderId?: string;
  @Field({ nullable: true }) orderStatus?: string;
  @Field({ nullable: true }) carrier?: string;
  @Field({ nullable: true }) trackingNumber?: string;
  @Field({ nullable: true }) trackingUrl?: string;
  @Field({ nullable: true, description: 'The courier’s latest report on the parcel' }) latestTrackingStatus?: string;
}

@Resolver()
export class RefundRequestsResolver {
  constructor(private requests: RefundRequestsService) {}

  @Authorized('PATIENT')
  @Query(() => RefundRequestModel, { nullable: true, description: 'The patient’s refund request that is still waiting for a decision' })
  myOpenRefundRequest(@CurrentUser() user: AuthUser) {
    return this.requests.open(user.id);
  }

  @Authorized('PATIENT')
  @Query(() => RefundRequestModel, { nullable: true, description: 'The patient’s latest refund request that has been answered: approved or declined' })
  myLastRefundDecision(@CurrentUser() user: AuthUser) {
    return this.requests.latestDecided(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => RefundRequestModel, { description: 'Ask for the money back. Needs no reason; an admin decides' })
  requestMyRefund(@CurrentUser() user: AuthUser) {
    return this.requests.request(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => String, { description: 'Stop the subscription at the end of the period already paid for' })
  cancelMySubscription(@CurrentUser() user: AuthUser) {
    return this.requests.cancelSubscription(user.id);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [RefundRequestForReviewModel])
  async refundRequests() {
    const rows = await this.requests.listOpen();
    return rows.map((r) => ({ ...r, patientName: `${r.patient.firstName} ${r.patient.lastName}`, patientEmail: r.patient.email }));
  }

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [RefundAwaitingReturnModel], { description: 'Refunds agreed in principle that wait for a parcel on its way to come back' })
  async refundsAwaitingReturn() {
    const rows = await this.requests.listAwaitingReturn();
    return rows.map((r) => ({
      ...r,
      patientName: `${r.patient.firstName} ${r.patient.lastName}`,
      patientEmail: r.patient.email,
      latestOrderStatus: r.order?.status,
      latestOrderSequence: r.order?.sequence,
      awaitingOrderId: r.awaitingOrderId ?? undefined,
      orderStatus: r.order?.status,
      carrier: r.order?.carrier ?? undefined,
      trackingNumber: r.order?.trackingNumber ?? undefined,
      trackingUrl: r.order?.trackingUrl ?? undefined,
      latestTrackingStatus: r.order?.trackingEvents?.[0]?.status,
    }));
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => RefundRequestModel, { description: 'The parcel is with the courier: refund once it is returned, and tell the patient not to open it' })
  refundWhenReturned(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('endSubscription', { defaultValue: true }) endSubscription: boolean,
  ) {
    return this.requests.waitForReturn(user.id, id, endSubscription);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => RefundRequestModel)
  decideRefundRequest(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('approve') approve: boolean,
    @Args('endSubscription', { defaultValue: false }) endSubscription: boolean,
  ) {
    return this.requests.decide(user.id, id, approve, endSubscription);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => Int, { description: 'Retry closing consultations after a successful first-order refund; returns the number closed' })
  retryRefundConsultationClosure(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.requests.retryConsultationClosure(user.id, id);
  }
}
