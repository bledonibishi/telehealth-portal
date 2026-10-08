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

  @Field(() => Int, { description: 'Side effects patients reported that no doctor has acknowledged yet (prescribers only; others get 0)' })
  sideEffectAlerts: number;

  @Field(() => Int, { description: 'Urgent appointment requests no doctor has answered yet — due within 24 hours (prescribers only; others get 0)' })
  urgentAppointments: number;

  @Field(() => Int, { description: 'Orders that failed, came back, cannot be supplied or are past their expected date (admins only; others get 0)' })
  orderProblems: number;

  @Field(() => Int, { description: 'Refund requests from patients waiting for an admin (admins only; others get 0)' })
  refundRequests: number;
}
