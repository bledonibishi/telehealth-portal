import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';

export enum ShipmentUrgency {
  UPCOMING = 'UPCOMING',
  DUE = 'DUE',
  OVERDUE = 'OVERDUE',
}
registerEnumType(ShipmentUrgency, { name: 'ShipmentUrgency' });

export enum ShipmentBlocker {
  NONE = 'NONE',
  AWAITING_CHECKIN = 'AWAITING_CHECKIN',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  NO_REPEATS_LEFT = 'NO_REPEATS_LEFT',
}
registerEnumType(ShipmentBlocker, { name: 'ShipmentBlocker' });

@ObjectType('ShipmentAlert')
export class ShipmentAlertModel {
  @Field(() => ID)
  prescriptionId: string;

  @Field(() => ID)
  patientId: string;

  @Field()
  patientName: string;

  @Field()
  medication: string;

  @Field()
  lastShippedAt: Date;

  @Field()
  nextDueAt: Date;

  @Field(() => Int, { description: 'Whole days until the next supply is due; negative once late' })
  daysUntilDue: number;

  @Field(() => ShipmentUrgency)
  urgency: ShipmentUrgency;

  @Field(() => ShipmentBlocker, { description: 'What is holding the next supply up, if anything' })
  blocker: ShipmentBlocker;

  @Field(() => Int)
  repeatsLeft: number;

  @Field({ nullable: true, description: 'When the patient asked for this supply from their dashboard; unset if they have not' })
  refillRequestedAt?: Date | null;
}
