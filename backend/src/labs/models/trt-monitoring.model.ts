import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { LabResultKind } from '../../common/enums';

@ObjectType('TrtLabStatus')
export class TrtLabStatusModel {
  @Field(() => LabResultKind)
  kind: LabResultKind;

  @Field({ description: 'When the next result is due' })
  dueAt: Date;

  @Field({ description: 'More than the grace period past due — repeats are on hold until a result is entered' })
  overdue: boolean;

  @Field(() => Float, { nullable: true })
  lastValue?: number;

  @Field({ nullable: true })
  lastUnit?: string;

  @Field({ nullable: true })
  lastCollectedAt?: Date;
}

@ObjectType('TrtMonitoring', { description: 'Safety blood-test monitoring for a patient on testosterone' })
export class TrtMonitoringModel {
  @Field(() => ID)
  patientId: string;

  @Field({ description: 'When testosterone treatment started (first prescription)' })
  startedAt: Date;

  @Field(() => [TrtLabStatusModel])
  labs: TrtLabStatusModel[];

  @Field({ description: 'Repeat supplies are blocked while this is true' })
  refillsOnHold: boolean;

  @Field(() => [String])
  holdReasons: string[];

  @Field(() => [String], { description: 'Worth a clinician’s attention, but not blocking' })
  warnings: string[];
}

@ObjectType('TrtMonitoringQueueEntry')
export class TrtMonitoringQueueEntryModel {
  @Field()
  patientName: string;

  @Field(() => TrtMonitoringModel)
  monitoring: TrtMonitoringModel;
}
