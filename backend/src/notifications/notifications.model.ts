import { ObjectType, InputType, Field, Int, ID } from '@nestjs/graphql';

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

@ObjectType()
export class NotificationParam {
  @Field()
  key: string;

  @Field()
  value: string;
}

@ObjectType({ description: 'Something that happened, in the reader\'s inbox. The apps turn kind + params into words (shared-types notificationText).' })
export class NotificationItem {
  @Field(() => ID)
  id: string;

  @Field({ description: 'A NotificationKind' })
  kind: string;

  @Field(() => [NotificationParam], { description: 'Values for the text, e.g. the patient\'s name' })
  params: NotificationParam[];

  @Field({ nullable: true, description: 'Where tapping it leads, as a path inside the reader\'s app' })
  href?: string;

  @Field(() => Int, { description: 'How many events this row stands for, e.g. 3 messages from the same patient' })
  count: number;

  @Field({ nullable: true })
  readAt?: Date;

  @Field()
  createdAt: Date;

  @Field({ description: 'When the latest event joined it; the list is newest first by this' })
  updatedAt: Date;
}

@ObjectType()
export class NotificationPreferencesModel {
  @Field({ description: 'Push for new messages from the care team' })
  pushMessages: boolean;

  @Field({ description: 'Push for shipping and delivery updates' })
  pushOrders: boolean;

  @Field({ description: 'Push for doses, check-ins and appointments' })
  pushReminders: boolean;

  @Field({ description: 'Push for referral rewards' })
  pushRewards: boolean;

  @Field({ description: 'One email when a message from the care team is still unread after a few hours' })
  emailUnreadMessages: boolean;
}

@InputType()
export class UpdateNotificationPreferencesInput {
  @Field({ nullable: true }) pushMessages?: boolean;
  @Field({ nullable: true }) pushOrders?: boolean;
  @Field({ nullable: true }) pushReminders?: boolean;
  @Field({ nullable: true }) pushRewards?: boolean;
  @Field({ nullable: true }) emailUnreadMessages?: boolean;
}
