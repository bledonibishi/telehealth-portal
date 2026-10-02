import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { ConsultationKind } from '../../common/enums';

@ObjectType('PrescriptionTemplateItem')
export class PrescriptionTemplateItemModel {
  @Field(() => ID)
  productId: string;

  @Field(() => ID)
  strengthId: string;

  @Field(() => Int)
  quantity: number;

  @Field()
  directions: string;
}

@ObjectType('PrescriptionTemplate')
export class PrescriptionTemplateModel {
  @Field()
  id: string;

  @Field(() => ConsultationKind)
  kind: ConsultationKind;

  @Field()
  name: string;

  @Field()
  description: string;

  @Field(() => [PrescriptionTemplateItemModel], { description: 'Ready to drop into the prescription form' })
  items: PrescriptionTemplateItemModel[];

  @Field(() => Int)
  validityDays: number;

  @Field(() => Int)
  refillsAllowed: number;

  @Field({ nullable: true })
  notes?: string;
}
