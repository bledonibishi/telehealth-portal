import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { InjectionSite } from '@prisma/client';
import { CheckInFeeling, DoseStatus } from '../../common/enums';
import { ProductModel, ProductStrengthModel } from '../../catalog/models/product.model';

registerEnumType(InjectionSite, { name: 'InjectionSite' });
export { InjectionSite };

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

  @Field(() => InjectionSite, { nullable: true, description: 'Where the injection went, when the patient said' })
  injectionSite?: InjectionSite;

  @Field(() => CheckInFeeling, { nullable: true, description: 'How the patient said they felt after this dose' })
  feelingAfter?: CheckInFeeling;

  @Field({ nullable: true })
  feelingAfterAt?: Date;

  // Resolved by DoseEventFieldsResolver from the prescription item
  product?: ProductModel;
  strength?: ProductStrengthModel;
}
