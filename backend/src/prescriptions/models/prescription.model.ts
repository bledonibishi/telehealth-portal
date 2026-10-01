import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { ConsultationModel } from '../../consultations/models/consultation.model';
import { ClinicianModel } from '../../clinicians/models/clinician.model';
import { ProductModel, ProductStrengthModel } from '../../catalog/models/product.model';
import { PrescriptionStatus } from '../../common/enums';

@ObjectType('PrescriptionItem')
export class PrescriptionItemModel {
  @Field(() => ID)
  id: string;

  @Field(() => ProductModel)
  product: ProductModel;

  @Field(() => ProductStrengthModel)
  strength: ProductStrengthModel;

  @Field(() => Int)
  quantity: number;

  @Field()
  directions: string;
}

@ObjectType('Prescription')
export class PrescriptionModel {
  @Field(() => ID)
  id: string;

  @Field({ nullable: true })
  consultationId?: string;

  @Field(() => ID)
  patientId: string;

  @Field(() => PrescriptionStatus)
  status: PrescriptionStatus;

  @Field()
  medication: string;

  @Field()
  dosage: string;

  @Field()
  instructions: string;

  @Field()
  issuedAt: Date;

  @Field({ nullable: true })
  validUntil?: Date;

  @Field(() => Int)
  refillsAllowed: number;

  @Field({ nullable: true })
  overrideReason?: string;

  @Field({ nullable: true, description: 'SHA-256 of the content at issue, printed on the document' })
  contentHash?: string;

  @Field({ nullable: true })
  supersedesId?: string;

  @Field({ nullable: true })
  cancelledAt?: Date;

  @Field({ nullable: true })
  cancelReason?: string;

  // Resolved by PrescriptionFieldsResolver
  items?: PrescriptionItemModel[];
  prescriber?: ClinicianModel;
  documentUrl?: string;

  // Fulfilment fields of the latest order — resolved by PrescriptionFieldsResolver
  // for clients written before orders were split out of prescriptions.
  pharmacyRef?: string;
  dispatchedAt?: Date;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  outForDeliveryAt?: Date;
  deliveredAt?: Date;

  @Field(() => ConsultationModel, { nullable: true })
  consultation?: ConsultationModel;
}
