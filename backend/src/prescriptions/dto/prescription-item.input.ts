import { InputType, Field, ID, Int } from '@nestjs/graphql';

@InputType()
export class PrescriptionItemInput {
  @Field(() => ID)
  productId: string;

  @Field(() => ID)
  strengthId: string;

  @Field(() => Int, { description: 'Number of packs' })
  quantity: number;

  @Field({ description: 'Directions for the patient, printed on the label' })
  directions: string;
}
