import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionModel } from './models/prescription.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';

@Resolver(() => PrescriptionModel)
export class PrescriptionsResolver {
  constructor(private prescriptionsService: PrescriptionsService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [PrescriptionModel])
  orders() {
    return this.prescriptionsService.findAllOrders();
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => PrescriptionModel)
  dispatchOrder(
    @Args('id', { type: () => ID }) id: string,
    @Args('pharmacyRef') pharmacyRef: string,
  ) {
    return this.prescriptionsService.dispatch(id, pharmacyRef);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => PrescriptionModel)
  markOrderOutForDelivery(
    @Args('id', { type: () => ID }) id: string,
    @Args('carrier', { nullable: true }) carrier?: string,
    @Args('trackingNumber', { nullable: true }) trackingNumber?: string,
    @Args('trackingUrl', { nullable: true }) trackingUrl?: string,
  ) {
    return this.prescriptionsService.markOutForDelivery(id, carrier, trackingNumber, trackingUrl);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => PrescriptionModel)
  markOrderDelivered(@Args('id', { type: () => ID }) id: string) {
    return this.prescriptionsService.markDelivered(id);
  }
}
