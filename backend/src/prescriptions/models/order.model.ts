import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { OrderStatus } from '../../common/enums';
import { PatientModel } from '../../patients/models/patient.model';
import { PrescriptionModel } from './prescription.model';

@ObjectType('DeliveryAddress')
export class DeliveryAddressModel {
  @Field()
  name: string;

  @Field({ nullable: true })
  phone?: string;

  @Field()
  addressLine1: string;

  @Field({ nullable: true })
  addressLine2?: string;

  @Field()
  city: string;

  @Field()
  postcode: string;

  @Field()
  country: string;
}

@ObjectType('Order')
export class OrderModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  prescriptionId: string;

  @Field(() => Int, { description: '1 = first supply; each repeat increments' })
  sequence: number;

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

  @Field({ nullable: true })
  outForDeliveryAt?: Date;

  @Field({ nullable: true })
  deliveredAt?: Date;

  @Field({ nullable: true })
  cancelledAt?: Date;

  @Field({ nullable: true })
  cancelReason?: string;

  @Field()
  createdAt: Date;

  @Field(() => PatientModel)
  patient: PatientModel;

  @Field(() => PrescriptionModel)
  prescription: PrescriptionModel;
}
