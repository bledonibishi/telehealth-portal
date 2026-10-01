import { ObjectType, Field, ID, Int, Float, registerEnumType } from '@nestjs/graphql';
import { CheckInFeeling } from '../../common/enums';

export enum MonthlyCheckInState {
  UPCOMING = 'UPCOMING',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
}
registerEnumType(MonthlyCheckInState, { name: 'MonthlyCheckInState' });

@ObjectType('WeightEntry')
export class WeightEntryModel {
  @Field(() => ID)
  checkInId: string;

  @Field(() => Int, { description: 'Month 1 is the first completed check-in' })
  month: number;

  @Field()
  date: Date;

  @Field(() => Float)
  weightKg: number;

  @Field(() => Float, { description: 'The previous check-in’s weight, or the starting weight for month 1' })
  previousWeightKg: number;

  @Field(() => Float, { description: 'Negative when weight went down' })
  changeKg: number;

  @Field(() => CheckInFeeling, { nullable: true })
  feeling?: CheckInFeeling;

  @Field({ nullable: true })
  note?: string;
}

@ObjectType('WeightJourney')
export class WeightJourneyModel {
  @Field(() => ID)
  patientId: string;

  @Field(() => Float, { nullable: true, description: 'From the intake questionnaire until a goal is saved' })
  startingWeightKg?: number;

  @Field(() => Float, { nullable: true, description: 'The latest check-in, or the starting weight before the first one' })
  currentWeightKg?: number;

  @Field({ nullable: true, description: 'When the current weight was measured (a daily entry or a monthly check-in)' })
  latestMeasurementAt?: Date;

  @Field(() => Float, { nullable: true })
  targetWeightKg?: number;

  @Field(() => Float, { nullable: true, description: 'Null until a target weight is set' })
  weightLostKg?: number;

  @Field(() => Float, { nullable: true })
  remainingKg?: number;

  @Field(() => Float, { nullable: true, description: '0–100, never above 100' })
  progressPercentage?: number;

  @Field()
  motivationMessage: string;

  @Field(() => [WeightEntryModel])
  entries: WeightEntryModel[];

  @Field(() => MonthlyCheckInState)
  checkInState: MonthlyCheckInState;

  @Field({ nullable: true })
  nextCheckInDueAt?: Date;

  @Field({ nullable: true })
  lastCheckInCompletedAt?: Date;

  @Field({ nullable: true, description: 'Opens the check-in. Only set while checkInState is READY.' })
  checkInUrl?: string;
}

export enum WeightMeasurementKind {
  DAILY = 'DAILY',
  CHECK_IN = 'CHECK_IN',
}
registerEnumType(WeightMeasurementKind, { name: 'WeightMeasurementKind' });

@ObjectType('WeightMeasurement')
export class WeightMeasurementModel {
  @Field(() => ID, { description: 'The daily entry id, or the check-in id for a monthly check-in' })
  id: string;

  @Field({ description: 'The exact moment of the weighing' })
  measuredAt: Date;

  @Field(() => Float)
  weightKg: number;

  @Field(() => WeightMeasurementKind)
  kind: WeightMeasurementKind;

  @Field(() => Float, { nullable: true, description: 'Versus the measurement before it (the starting weight for the first). Null when nothing precedes it.' })
  changeKg?: number | null;

  @Field({ nullable: true })
  note?: string;

  @Field(() => CheckInFeeling, { nullable: true })
  feeling?: CheckInFeeling;
}

@ObjectType('WeightTimeline')
export class WeightTimelineModel {
  @Field(() => [WeightMeasurementModel], { description: 'Oldest first, within the requested window' })
  measurements: WeightMeasurementModel[];

  @Field(() => Float, { nullable: true })
  startingWeightKg?: number;

  @Field({ nullable: true, description: 'When the starting weight was given (the intake questionnaire)' })
  startingAt?: Date;

  @Field(() => Float, { nullable: true })
  targetWeightKg?: number;

  @Field({ nullable: true, description: 'The first measurement ever — bounds for month/year navigation' })
  earliestAt?: Date;

  @Field({ nullable: true, description: 'The most recent measurement ever' })
  latestAt?: Date;

  @Field({ description: 'True when the window held more than the limit; the newest measurements are returned' })
  truncated: boolean;
}
