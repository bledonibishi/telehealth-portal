import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { BookingStatus } from '@prisma/client';

registerEnumType(BookingStatus, { name: 'BookingStatus' });
export { BookingStatus };

@ObjectType('Booking', { description: 'A time booked with the clinic, mirrored from the scheduling provider' })
export class BookingModel {
  @Field(() => ID)
  id: string;

  @Field({ description: 'The provider’s id for the booking; changes when it is rescheduled' })
  uid: string;

  @Field({ description: 'What it is for, e.g. "APPOINTMENT_ROUTINE"' })
  purpose: string;

  @Field({ nullable: true, description: 'The thing it belongs to (e.g. an appointment request), when there is one' })
  referenceId?: string | null;

  @Field(() => BookingStatus)
  status: BookingStatus;

  @Field({ nullable: true })
  title?: string | null;

  @Field()
  startsAt: Date;

  @Field()
  endsAt: Date;

  @Field({ nullable: true })
  meetingUrl?: string | null;

  @Field({ nullable: true })
  location?: string | null;

  @Field({ nullable: true })
  hostName?: string | null;

  @Field({ nullable: true })
  cancelReason?: string | null;

  @Field({ description: 'The patient can still move it to another time (see rescheduleSession)' })
  canReschedule: boolean;
}

@ObjectType('StaffBooking', { description: 'A booking as the clinical team sees it' })
export class StaffBookingModel extends BookingModel {
  @Field(() => ID, { nullable: true, description: 'Null when it was booked on the provider directly rather than from the portal' })
  patientId?: string | null;

  @Field({ nullable: true })
  attendeeName?: string | null;

  @Field({ nullable: true })
  attendeeEmail?: string | null;

  @Field(() => ID, { nullable: true })
  clinicianId?: string | null;
}

@ObjectType('BookingSession', { description: 'Everything the scheduler needs to let the signed-in patient pick a time' })
export class BookingSessionModel {
  @Field()
  purpose: string;

  @Field({ description: 'What the patient is booking, in their words' })
  label: string;

  @Field({ description: 'The provider’s event link, e.g. "clinic/routine"' })
  calLink: string;

  @Field({ nullable: true, description: 'The provider’s web origin when it is not the default (e.g. an EU account)' })
  calOrigin?: string | null;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field({ description: 'Proves to our webhook who booked and what for. Short-lived.' })
  token: string;

  @Field({ nullable: true, description: 'A short line for the host, prefilled as the booking’s notes (e.g. "Reason: Side effect")' })
  notes?: string | null;

  @Field({ nullable: true, description: 'Set when the session is for moving an existing booking: the scheduler opens on it' })
  rescheduleUid?: string | null;

  @Field(() => BookingModel, { nullable: true, description: 'The patient’s upcoming booking for this purpose and reference, if they already have one' })
  current?: BookingModel | null;
}
