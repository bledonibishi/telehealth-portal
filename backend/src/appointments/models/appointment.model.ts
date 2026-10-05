import { Field, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { AppointmentReason, AppointmentStatus, AppointmentUrgency } from '@prisma/client';

registerEnumType(AppointmentReason, { name: 'AppointmentReason' });
registerEnumType(AppointmentStatus, { name: 'AppointmentStatus' });
registerEnumType(AppointmentUrgency, { name: 'AppointmentUrgency', description: 'URGENT is answered within 24 hours, ROUTINE within 3 days' });
export { AppointmentReason, AppointmentStatus, AppointmentUrgency };

@InputType()
export class RequestAppointmentInput {
  @Field(() => AppointmentReason)
  reason: AppointmentReason;

  @Field({ nullable: true, description: 'Anything the patient wants to add; the reason alone is enough' })
  details?: string;

  @Field({ nullable: true, description: 'The patient thinks it can’t wait' })
  urgent?: boolean;

  @Field(() => Int, { nullable: true, description: '0–10, when they are in pain' })
  painLevel?: number;

  @Field(() => [String], { nullable: true, description: 'Keys of the warning signs ticked, e.g. "chest_pain"' })
  redFlags?: string[];

  @Field({ nullable: true, description: 'When suits them, in their own words' })
  preferredTimes?: string;
}

@InputType()
export class ScheduleAppointmentInput {
  @Field(() => ID)
  id: string;

  @Field()
  scheduledFor: Date;

  @Field({ nullable: true, description: 'A video-call link, when it is a remote appointment' })
  meetingUrl?: string;

  @Field({ nullable: true, description: 'Shown to the patient' })
  note?: string;
}

@ObjectType('AppointmentRequest')
export class AppointmentRequestModel {
  @Field(() => ID)
  id: string;

  @Field(() => AppointmentReason)
  reason: AppointmentReason;

  @Field()
  details: string;

  @Field(() => Int, { nullable: true })
  painLevel?: number | null;

  @Field(() => [String])
  redFlags: string[];

  @Field(() => AppointmentUrgency)
  urgency: AppointmentUrgency;

  @Field()
  emergencyAdvised: boolean;

  @Field({ nullable: true })
  preferredTimes?: string | null;

  @Field(() => AppointmentStatus)
  status: AppointmentStatus;

  @Field({ description: 'When a doctor must have answered by' })
  respondBy: Date;

  @Field({ nullable: true })
  scheduledFor?: Date | null;

  @Field({ nullable: true })
  meetingUrl?: string | null;

  @Field({ nullable: true, description: 'What the doctor told the patient' })
  clinicianNote?: string | null;

  @Field({ nullable: true })
  clinicianName?: string | null;

  @Field()
  createdAt: Date;

  @Field({ nullable: true, description: 'The booking purpose to open so the patient can pick a time themselves; null when online booking is not available for this request' })
  bookingPurpose?: string | null;

  @Field({ nullable: true, description: 'Set right after an urgent request, when there is something to tell the patient now' })
  advice?: string | null;
}

@ObjectType('AppointmentAlert', { description: 'An appointment request as the clinical team sees it' })
export class AppointmentAlertModel extends AppointmentRequestModel {
  @Field(() => ID)
  patientId: string;

  @Field()
  patientName: string;

  @Field({ description: 'The respond-by time has passed and nobody has answered' })
  overdue: boolean;
}
