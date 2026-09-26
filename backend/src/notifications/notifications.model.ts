import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class NotificationCounts {
  @Field(() => Int)
  newLeads: number;

  @Field(() => Int)
  pendingConsultations: number;

  @Field(() => Int)
  patientMessages: number; // consultations where last message is from PATIENT (no reply yet)

  @Field(() => Int)
  pendingOrders: number;
}
