import { InputType, Field, ID, Float } from '@nestjs/graphql';
import { LabResultKind } from '../../common/enums';

@InputType()
export class RecordLabResultInput {
  @Field(() => ID)
  patientId: string;

  @Field(() => LabResultKind)
  kind: LabResultKind;

  @Field({ nullable: true, description: 'What was measured — required when kind is OTHER' })
  analyteName?: string;

  @Field(() => Float)
  value: number;

  @Field()
  unit: string;

  @Field(() => Float, { nullable: true, description: 'Omit when the lab/kind has no standard range (e.g. OTHER)' })
  referenceRangeLow?: number;

  @Field(() => Float, { nullable: true })
  referenceRangeHigh?: number;

  @Field({ description: 'When the specimen was collected, not when it was entered' })
  collectedAt: Date;

  @Field({ nullable: true })
  note?: string;

  @Field(() => ID, { nullable: true, description: 'The lab report these were typed from' })
  reportId?: string;
}

@InputType()
export class LabResultRowInput {
  @Field(() => LabResultKind)
  kind: LabResultKind;

  @Field({ nullable: true, description: 'What was measured — required when kind is OTHER' })
  analyteName?: string;

  @Field(() => Float)
  value: number;

  @Field()
  unit: string;

  @Field(() => Float, { nullable: true })
  referenceRangeLow?: number;

  @Field(() => Float, { nullable: true })
  referenceRangeHigh?: number;

  @Field({ description: 'When the specimen was collected' })
  collectedAt: Date;
}

@InputType()
export class RecordLabResultsInput {
  @Field(() => ID)
  patientId: string;

  @Field(() => ID, { nullable: true, description: 'The lab report these were typed from' })
  reportId?: string;

  @Field(() => [LabResultRowInput])
  results: LabResultRowInput[];
}
