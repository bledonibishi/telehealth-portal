import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType('AdherenceWeek')
export class AdherenceWeekModel {
  @Field()
  weekStart: Date;

  @Field(() => Int)
  taken: number;

  @Field(() => Int)
  missed: number;

  @Field(() => Int)
  skipped: number;

  @Field(() => Float, { description: 'taken / (taken + missed + skipped), as a percentage' })
  adherencePct: number;
}
