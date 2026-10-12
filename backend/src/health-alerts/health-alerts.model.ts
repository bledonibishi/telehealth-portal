import { Field, Float, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum HealthAlertLevelEnum { RED = 'RED', YELLOW = 'YELLOW', ORANGE = 'ORANGE' }
registerEnumType(HealthAlertLevelEnum, { name: 'HealthAlertLevel' });

export enum HealthAlertKindEnum {
  WEIGHT_GAIN = 'WEIGHT_GAIN',
  SEVERE_SIDE_EFFECT = 'SEVERE_SIDE_EFFECT',
  PENDING_REVIEWS = 'PENDING_REVIEWS',
  OVERDUE_CHECK_INS = 'OVERDUE_CHECK_INS',
  WEIGHT_ENTRY_CHECK = 'WEIGHT_ENTRY_CHECK',
  PRESCRIPTIONS_EXPIRING = 'PRESCRIPTIONS_EXPIRING',
}
registerEnumType(HealthAlertKindEnum, { name: 'HealthAlertKind' });

@ObjectType('HealthAlertPatient')
export class HealthAlertPatientModel {
  @Field(() => String)
  id: string;

  @Field()
  name: string;
}

@ObjectType('HealthAlert', { description: 'Something a doctor should look at, with how urgent it is. It only points; it changes nothing.' })
export class HealthAlertModel {
  @Field()
  id: string;

  @Field(() => HealthAlertLevelEnum)
  level: HealthAlertLevelEnum;

  @Field(() => HealthAlertKindEnum)
  kind: HealthAlertKindEnum;

  @Field(() => Int, { description: 'How many patients or items it covers' })
  count: number;

  @Field(() => [HealthAlertPatientModel], { description: 'Who it is about: the first few for a group' })
  patients: HealthAlertPatientModel[];

  @Field(() => Float, { nullable: true, description: 'WEIGHT_GAIN: percent over 4 weeks. PENDING_REVIEWS: average days waiting. WEIGHT_ENTRY_CHECK: the latest weight.' })
  value?: number | null;

  @Field(() => Float, { nullable: true, description: 'WEIGHT_ENTRY_CHECK: the weight before the latest' })
  other?: number | null;

  @Field(() => [String], { description: 'SEVERE_SIDE_EFFECT: the effects reported, as keys' })
  effects: string[];
}
