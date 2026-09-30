import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { ConsultationKind, ProductCategory, ProductForm } from '../../common/enums';

@ObjectType('ProductStrength')
export class ProductStrengthModel {
  @Field(() => ID)
  id: string;

  @Field()
  label: string;

  @Field({ nullable: true })
  packDescription?: string;

  @Field(() => Int, { nullable: true, description: '1 = starting dose; null when the product is not titrated' })
  titrationStep?: number;

  @Field(() => Int)
  defaultQuantity: number;

  @Field()
  active: boolean;
}

@ObjectType('Product')
export class ProductModel {
  @Field(() => ID)
  id: string;

  @Field()
  slug: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  brandName?: string;

  @Field(() => ConsultationKind)
  kind: ConsultationKind;

  @Field(() => ProductCategory)
  category: ProductCategory;

  @Field(() => ProductForm)
  form: ProductForm;

  @Field()
  requiresColdChain: boolean;

  @Field(() => Int, { nullable: true })
  weeksPerStep?: number;

  @Field(() => Int, { nullable: true, description: 'Days between doses, e.g. 7 for weekly — null when there is no fixed interval (see dosesPerWeek)' })
  doseIntervalDays?: number;

  @Field(() => Int, { nullable: true, description: 'Doses a week on fixed weekdays (e.g. 2 for a twice-weekly patch) — used when there is no fixed interval' })
  dosesPerWeek?: number;

  @Field({ nullable: true })
  defaultDirections?: string;

  @Field()
  active: boolean;

  @Field(() => [ProductStrengthModel])
  strengths: ProductStrengthModel[];
}
