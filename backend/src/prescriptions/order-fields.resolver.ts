import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { OrderModel } from './models/order.model';
import { partnerReference } from './partner-payload';
import { DeliveryAddressModel } from './models/order.model';
import { storedAddressOf } from './delivery-address';

@Resolver(() => OrderModel)
export class OrderFieldsResolver {
  /** The parcel's code, worked out from the order id so it never needs storing or keeping in step. */
  @ResolveField(() => String)
  reference(@Parent() order: { id: string }) {
    return partnerReference(order.id);
  }

  /** Where it was sent. Read through storedAddressOf, so an order saved with the older shape still returns a valid address. */
  @ResolveField(() => DeliveryAddressModel, { nullable: true, description: 'Where it was sent, captured at dispatch' })
  shippingAddress(@Parent() order: { shippingAddress?: unknown; patient?: { firstName?: string; lastName?: string } | null }) {
    return storedAddressOf(order.shippingAddress, order.patient);
  }
}
