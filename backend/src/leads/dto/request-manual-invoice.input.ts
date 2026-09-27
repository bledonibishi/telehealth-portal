import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class RequestManualInvoiceInput {
  @Field(() => ID)
  leadId: string;

  // Matches a key in website/public/scripts/checkout.js's PLANS object
  // (e.g. "hrt-starter"), not a Stripe price ID.
  @Field()
  planId: string;

  @Field()
  planName: string;
}
