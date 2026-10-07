import { Field, Float, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('BodyMeasurement')
export class BodyMeasurementModel {
  @Field(() => ID)
  id: string;

  @Field()
  measuredAt: Date;

  @Field(() => Float, { nullable: true })
  waistCm?: number | null;

  @Field(() => Float, { nullable: true })
  hipsCm?: number | null;

  @Field(() => Float, { nullable: true })
  armCm?: number | null;
}
