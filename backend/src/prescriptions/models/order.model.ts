import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { OrderStatus } from '../../common/enums';
import { PatientModel } from '../../patients/models/patient.model';
import { PrescriptionModel } from './prescription.model';
import { PartnerTransmissionModel } from './partner-transmission.model';

@ObjectType('DeliveryAddress')
export class DeliveryAddressModel {
  @Field()
  name: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  addressLine1?: string;

  @Field({ nullable: true })
  addressLine2?: string;

  @Field({ nullable: true })
  city?: string;

  @Field({ nullable: true })
  postcode?: string;

  @Field({ nullable: true })
  country?: string;
}

@ObjectType('TrackingEvent', { description: 'One step in an order’s journey, newest first on the order' })
export class TrackingEventModel {
  @Field(() => ID)
  id: string;

  @Field({ description: 'READY_FOR_PICKUP, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, DELIVERY_FAILED, RETURNED or EXCEPTION' })
  status: string;

  @Field()
  occurredAt: Date;

  @Field({ nullable: true })
  location?: string;

  @Field({ nullable: true })
  note?: string;

  @Field({ description: 'MANUAL (staff pressed a button), WEBHOOK (the courier told us) or POLL (we asked the courier)' })
  source: string;
}

@ObjectType('Order')
export class OrderModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  prescriptionId: string;

  @Field(() => Int, { description: '1 = first supply; each repeat increments' })
  sequence: number;

  @Field({ description: 'Short code that identifies the parcel: on the packing slip, quoted by the courier and shown to the patient' })
  reference: string;

  @Field(() => OrderStatus)
  status: OrderStatus;

  @Field(() => DeliveryAddressModel, { nullable: true, description: 'Where it was sent, captured at dispatch' })
  shippingAddress?: DeliveryAddressModel;

  @Field({ nullable: true })
  pharmacyRef?: string;

  @Field({ nullable: true })
  dispatchedAt?: Date;

  @Field({ nullable: true })
  carrier?: string;

  @Field({ nullable: true })
  trackingNumber?: string;

  @Field({ nullable: true })
  trackingUrl?: string;

  @Field({ nullable: true, description: 'When the pharmacy packed it and began waiting for the courier' })
  readyForPickupAt?: Date;

  @Field(() => [TrackingEventModel], { description: 'The journey so far, newest first' })
  trackingEvents: TrackingEventModel[];

  @Field({ nullable: true, description: 'Start of the courier’s expected delivery window' })
  estimatedDeliveryFrom?: Date;

  @Field({ nullable: true, description: 'End of the courier’s expected delivery window' })
  estimatedDeliveryTo?: Date;

  @Field({ nullable: true })
  outForDeliveryAt?: Date;

  @Field({ nullable: true })
  deliveredAt?: Date;

  @Field({ nullable: true })
  cancelledAt?: Date;

  @Field({ nullable: true })
  cancelReason?: string;

  @Field({ nullable: true, description: 'What happened to the patient’s money when it was cancelled: refunded, subscription ended, or nothing' })
  cancelBillingNote?: string;

  @Field()
  createdAt: Date;

  @Field(() => PartnerTransmissionModel, { nullable: true, description: 'Whether the order summary reached the external pharmacy partner' })
  partnerTransmission?: PartnerTransmissionModel;

  @Field(() => PatientModel)
  patient: PatientModel;

  @Field(() => PrescriptionModel)
  prescription: PrescriptionModel;
}
