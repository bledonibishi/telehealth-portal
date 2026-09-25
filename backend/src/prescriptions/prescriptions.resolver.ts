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
}
