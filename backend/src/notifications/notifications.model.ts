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

  @Field(() => Int, { description: 'GLP-1 patients who have not taken several doses in a row (see missedDoseAlerts)' })
  missedDoseAlerts: number;

  @Field(() => Int, { description: 'Patients whose next supply is due or late (fulfilment and prescribers only; others get 0)' })
  shipmentsDue: number;
}
