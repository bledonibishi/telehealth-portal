import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum RefillState {
  UNAVAILABLE = 'UNAVAILABLE',
  NOT_YET = 'NOT_YET',
  CHECK_IN_FIRST = 'CHECK_IN_FIRST',
  IN_REVIEW = 'IN_REVIEW',
  READY = 'READY',
  REQUESTED = 'REQUESTED',
  NO_REPEATS = 'NO_REPEATS',
}
registerEnumType(RefillState, { name: 'RefillState', description: 'What the patient’s refill button can do right now' });

@ObjectType('SupplyStatus', { description: 'Where the signed-in patient’s subscription and next supply stand' })
export class SupplyStatusModel {
  @Field({ description: 'Whether the subscription is live (activated and not ended)' })
  subscriptionActive: boolean;

  @Field({ nullable: true, description: 'The medicine on the active prescription' })
  medication?: string;

  @Field({ nullable: true, description: 'When the next supply is due, once one has shipped' })
  nextSupplyAt?: Date;

  @Field(() => Int, { nullable: true, description: 'Whole days until then; negative once late' })
  daysUntilNextSupply?: number;

  @Field(() => Int, { nullable: true })
  repeatsLeft?: number;

  @Field({ description: 'A supply is already with the pharmacy and not yet dispatched' })
  supplyBeingPrepared: boolean;

  @Field(() => RefillState)
  refillState: RefillState;

  @Field(() => Int, { nullable: true, description: 'While refillState is NOT_YET: days until the patient can ask' })
  refillOpensInDays?: number;

  @Field({ nullable: true })
  refillRequestedAt?: Date;
}
