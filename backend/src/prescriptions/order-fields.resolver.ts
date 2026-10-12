import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { OrderModel } from './models/order.model';
import { partnerReference } from './partner-payload';

@Resolver(() => OrderModel)
export class OrderFieldsResolver {
  /** The parcel's code, worked out from the order id so it never needs storing or keeping in step. */
  @ResolveField(() => String)
  reference(@Parent() order: { id: string }) {
    return partnerReference(order.id);
  }
}
