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

  @Field({ description: 'Whether a progress photo was kept with this weighing. The photo itself is only ever given to the patient and their doctors.' })
  hasPhoto: boolean;
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

@ObjectType('ProgressPhoto')
export class ProgressPhotoModel {
  @Field(() => ID, { description: 'The weight entry the photo was taken with' })
  entryId: string;

  @Field()
  measuredAt: Date;

  @Field(() => Float)
  weightKg: number;

  @Field(() => ID, { description: 'Open it at /uploads/<id>/file with your sign-in token' })
  photoFileId: string;
}

export enum ForecastUnavailableReason {
  NOT_ENOUGH_DATA = 'NOT_ENOUGH_DATA',
  NOT_LOSING = 'NOT_LOSING',
  TOO_VARIABLE = 'TOO_VARIABLE',
}
registerEnumType(ForecastUnavailableReason, { name: 'ForecastUnavailableReason' });

export enum ForecastConfidence {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}
registerEnumType(ForecastConfidence, { name: 'ForecastConfidence' });

@ObjectType('WeightForecastPoint')
export class WeightForecastPointModel {
  @Field()
  at: Date;

  @Field(() => Int)
  monthsAhead: number;

  @Field(() => Float)
  weightKg: number;
}

@ObjectType('WeightForecast', { description: 'Where the weight is heading at the current pace — a straight-line trend, not a medical prediction' })
export class WeightForecastModel {
  @Field()
  available: boolean;

  @Field(() => ForecastUnavailableReason, { nullable: true })
  reason?: ForecastUnavailableReason;

  @Field(() => Int, { nullable: true })
  basedOnPoints?: number;

  @Field(() => Int, { nullable: true, description: 'How many days of measurements the trend was drawn from' })
  basedOnDays?: number;

  @Field(() => Float, { nullable: true, description: 'Negative while losing' })
  kgPerWeek?: number;

  @Field(() => ForecastConfidence, { nullable: true })
  confidence?: ForecastConfidence;

  @Field({ nullable: true, description: 'Where the trend line starts: the latest measurement’s date' })
  fromAt?: Date;

  @Field(() => Float, { nullable: true, description: 'The trend line’s value on that date' })
  fromWeightKg?: number;

  @Field(() => [WeightForecastPointModel], { description: 'One point a month for 6 months; empty when unavailable' })
  points: WeightForecastPointModel[];

  @Field({ nullable: true, description: 'When the trend reaches the target weight, if within the 6 months' })
  reachesTargetAt?: Date;
}
