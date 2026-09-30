import { ObjectType, Field, ID } from '@nestjs/graphql';
import { DoseStatus } from '../../common/enums';
import { ProductModel, ProductStrengthModel } from '../../catalog/models/product.model';

@ObjectType('DoseEvent')
export class DoseEventModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  prescriptionItemId: string;

  @Field()
  scheduledFor: Date;

  @Field(() => DoseStatus)
  status: DoseStatus;

  @Field({ nullable: true })
  takenAt?: Date;

  @Field({ nullable: true })
  note?: string;

  // Resolved by DoseEventFieldsResolver from the prescription item
  product?: ProductModel;
  strength?: ProductStrengthModel;
}
