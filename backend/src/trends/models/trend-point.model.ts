import { ObjectType, Field, ID, Float } from '@nestjs/graphql';

@ObjectType('TrendPoint')
export class TrendPointModel {
  @Field(() => ID)
  checkInId: string;

  @Field()
  date: Date;

  @Field(() => Float)
  value: number;
}
