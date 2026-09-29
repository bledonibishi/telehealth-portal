import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class UpdateDeliveryDetailsInput {
  @Field()
  phone: string;

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
